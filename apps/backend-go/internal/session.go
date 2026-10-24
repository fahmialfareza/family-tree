package app

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Login model: a session row per login. Clients get a short-lived JWT access token naming the session
// (sid) plus, for the current API, an opaque refresh token that rotates on every use. The legacy
// /api/auth/signin route gets a 24h access token without refresh, because the old frontend cannot refresh.
// Every authenticated request checks the session row, so logout and password changes take effect at once.

const (
	accessTokenTTL       = 15 * time.Minute
	legacyAccessTokenTTL = 24 * time.Hour
	refreshTokenTTL      = 30 * 24 * time.Hour
	refreshGrace         = 30 * time.Second
)

var (
	errSessionInvalid = errors.New("session is invalid or expired")
	errTokenInvalid   = errors.New("token is invalid, expired or already used")
	errRefreshReused  = errors.New("refresh token is unknown or was already rotated")
)

type sessionRow struct {
	ID                   string `gorm:"primaryKey;type:text"`
	UserID               string `gorm:"type:text"`
	RefreshTokenHash     *string
	PrevRefreshTokenHash *string
	UserAgent            string
	IP                   string
	CreatedAt            time.Time
	LastUsedAt           time.Time
	ExpiresAt            time.Time
	RevokedAt            *time.Time
}

func (sessionRow) TableName() string { return "sessions" }

type authTokenRow struct {
	ID          string `gorm:"primaryKey;type:text"`
	UserID      string `gorm:"type:text"`
	Purpose     string
	TokenHash   string
	Email       *string
	BindingHash *string
	ExpiresAt   time.Time
	UsedAt      *time.Time
	CreatedAt   time.Time
}

func (authTokenRow) TableName() string { return "auth_tokens" }

// Session is the client-facing view of a login.
type Session struct {
	ID         string    `json:"_id"`
	UserAgent  string    `json:"userAgent"`
	IP         string    `json:"ip"`
	CreatedAt  time.Time `json:"createdAt"`
	LastUsedAt time.Time `json:"lastUsedAt"`
	Current    bool      `json:"current"`
}

// newOpaqueToken returns a random URL-safe token and the hash stored for it.
func newOpaqueToken() (plain, hash string, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	plain = base64.RawURLEncoding.EncodeToString(raw)
	return plain, hashInviteToken(plain), nil
}

type accessClaims struct {
	SessionID string `json:"sid"`
	Type      string `json:"typ"`
	jwt.RegisteredClaims
}

func signAccessToken(userID, sessionID string, ttl time.Duration) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(ttl)
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims{
		SessionID: sessionID,
		Type:      "access",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	})
	s, err := tok.SignedString(jwtSecret)
	return s, exp, err
}

// parseAccessToken validates signature (HS256 only), expiry and shape. Tokens from before sessions
// existed carry no sid and are rejected, which signs everyone out once.
func parseAccessToken(s string) (userID, sessionID string, err error) {
	var claims accessClaims
	_, err = jwt.ParseWithClaims(s, &claims, func(*jwt.Token) (any, error) { return jwtSecret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		return "", "", err
	}
	if claims.Type != "access" || claims.Subject == "" || claims.SessionID == "" {
		return "", "", errSessionInvalid
	}
	return claims.Subject, claims.SessionID, nil
}

// TokenPair is returned by every login flow of the current API.
type TokenPair struct {
	AccessToken          string    `json:"accessToken"`
	AccessTokenExpiresAt time.Time `json:"accessTokenExpiresAt"`
	RefreshToken         string    `json:"refreshToken,omitempty"`
	User                 *User     `json:"user"`
}

// createSession starts a session. withRefresh=false is the legacy 24h-token mode.
func createSession(ctx context.Context, user *User, userAgent, ip string, withRefresh bool) (*TokenPair, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/createSession").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	now := time.Now()
	row := sessionRow{
		ID:         uuid.Must(uuid.NewV7()).String(),
		UserID:     user.ID,
		UserAgent:  truncate(userAgent, 255),
		IP:         ip,
		CreatedAt:  now,
		LastUsedAt: now,
		ExpiresAt:  now.Add(legacyAccessTokenTTL),
	}
	ttl := legacyAccessTokenTTL
	var refresh string
	if withRefresh {
		plain, hash, err := newOpaqueToken()
		if err != nil {
			return nil, err
		}
		refresh, row.RefreshTokenHash, row.ExpiresAt, ttl = plain, &hash, now.Add(refreshTokenTTL), accessTokenTTL
	}
	if err := DB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	access, exp, err := signAccessToken(user.ID, row.ID, ttl)
	if err != nil {
		return nil, err
	}
	return &TokenPair{AccessToken: access, AccessTokenExpiresAt: exp, RefreshToken: refresh, User: user}, nil
}

// rotateRefreshToken exchanges a refresh token for a new pair. Presenting a token that was already
// rotated away revokes the session: either the client or an attacker holds a stolen copy.
func rotateRefreshToken(ctx context.Context, refresh, userAgent, ip string) (*TokenPair, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/rotateRefreshToken").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	hash := hashInviteToken(refresh)
	var pair *TokenPair
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row sessionRow
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("refresh_token_hash = ?", hash).Take(&row).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errRefreshReused
		}
		if err != nil {
			return err
		}
		now := time.Now()
		if row.RevokedAt != nil || now.After(row.ExpiresAt) {
			return errSessionInvalid
		}
		user, err := loadLiveUser(tx, row.UserID)
		if err != nil {
			return errSessionInvalid
		}
		plain, newHash, err := newOpaqueToken()
		if err != nil {
			return err
		}
		if err := tx.Model(&sessionRow{}).Where("id = ?", row.ID).Updates(map[string]any{
			"refresh_token_hash":      newHash,
			"prev_refresh_token_hash": hash,
			"last_used_at":            now,
			"expires_at":              now.Add(refreshTokenTTL),
			"user_agent":              truncate(userAgent, 255),
			"ip":                      ip,
		}).Error; err != nil {
			return err
		}
		access, exp, err := signAccessToken(row.UserID, row.ID, accessTokenTTL)
		if err != nil {
			return err
		}
		pair = &TokenPair{AccessToken: access, AccessTokenExpiresAt: exp, RefreshToken: plain, User: user}
		return nil
	})
	if errors.Is(err, errRefreshReused) {
		// Revoke outside the transaction above, which rolled back. Unknown tokens match nothing here.
		// A token rotated in the last refreshGrace is most likely a second tab refreshing at the same
		// time, so that session is spared; the request still fails.
		if rerr := DB.WithContext(ctx).Model(&sessionRow{}).
			Where("prev_refresh_token_hash = ? AND revoked_at IS NULL AND last_used_at < ?", hash, time.Now().Add(-refreshGrace)).
			Update("revoked_at", time.Now()).Error; rerr != nil {
			return nil, rerr
		}
		return nil, errSessionInvalid
	}
	return pair, err
}

func loadLiveUser(db *gorm.DB, userID string) (*User, error) {
	var u userRow
	if err := db.Where("id = ?", userID).First(&u).Error; err != nil {
		return nil, err
	}
	return u.toModel(), nil
}

// sessionUser returns the user of a live session in one query; used on every authenticated request.
func sessionUser(ctx context.Context, sessionID, userID string) (*User, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/sessionUser").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var row userRow
	err := DB.WithContext(ctx).
		Joins("JOIN sessions ON sessions.user_id = users.id AND sessions.id = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > now()", sessionID).
		Where("users.id = ?", userID).
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return row.toModel(), nil
}

func revokeSession(ctx context.Context, userID, sessionID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	res := DB.WithContext(ctx).Model(&sessionRow{}).
		Where("id = ? AND user_id = ? AND revoked_at IS NULL", sessionID, userID).Update("revoked_at", time.Now())
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// revokeSessionsTx revokes all of a user's sessions except keepSessionID (may be "").
func revokeSessionsTx(tx *gorm.DB, userID, keepSessionID string) error {
	return tx.Model(&sessionRow{}).Where("user_id = ? AND id <> ? AND revoked_at IS NULL", userID, keepSessionID).
		Update("revoked_at", time.Now()).Error
}

func listSessions(ctx context.Context, userID, currentID string) ([]Session, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var rows []sessionRow
	if err := DB.WithContext(ctx).Where("user_id = ? AND revoked_at IS NULL AND expires_at > now()", userID).
		Order("last_used_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Session, 0, len(rows))
	for _, r := range rows {
		out = append(out, Session{ID: r.ID, UserAgent: r.UserAgent, IP: r.IP, CreatedAt: r.CreatedAt, LastUsedAt: r.LastUsedAt, Current: r.ID == currentID})
	}
	return out, nil
}

// issueAuthToken creates a single-use token for purpose, invalidating earlier unused ones of the same purpose.
func issueAuthToken(ctx context.Context, userID, purpose, email string, ttl time.Duration) (string, error) {
	return issueBoundAuthToken(ctx, userID, purpose, email, "", ttl)
}

// issueBoundAuthToken is issueAuthToken with a binding hash that the redeemer must match.
func issueBoundAuthToken(ctx context.Context, userID, purpose, email, bindingHash string, ttl time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	plain, hash, err := newOpaqueToken()
	if err != nil {
		return "", err
	}
	now := time.Now()
	err = DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := invalidateAuthTokens(tx, userID, purpose); err != nil {
			return err
		}
		return tx.Create(&authTokenRow{
			ID: uuid.Must(uuid.NewV7()).String(), UserID: userID, Purpose: purpose, TokenHash: hash,
			Email: strPtr(email), BindingHash: strPtr(bindingHash), ExpiresAt: now.Add(ttl), CreatedAt: now,
		}).Error
	})
	return plain, err
}

// invalidateAuthTokens burns a user's outstanding tokens of one purpose (e.g. reset links after a password change).
func invalidateAuthTokens(tx *gorm.DB, userID, purpose string) error {
	return tx.Model(&authTokenRow{}).Where("user_id = ? AND purpose = ? AND used_at IS NULL", userID, purpose).
		Update("used_at", time.Now()).Error
}

// consumeAuthToken marks a valid token used and returns it. Run inside the transaction that acts on it.
func consumeAuthToken(tx *gorm.DB, plain, purpose string) (*authTokenRow, error) {
	var row authTokenRow
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > now()", hashInviteToken(plain), purpose).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errTokenInvalid
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Model(&authTokenRow{}).Where("id = ?", row.ID).Update("used_at", time.Now()).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
