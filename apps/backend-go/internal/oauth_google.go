package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

// Google sign-in (OpenID Connect, authorization code + PKCE):
//  1. GET  /api/auth/google/start?binding=B&next=/path -> redirect to Google; state, PKCE verifier, nonce and
//     hash(B) live in a signed cookie. B is a random value the frontend keeps in its own httpOnly cookie.
//  2. GET  /api/auth/google/callback  -> verify, find/link/create the user, redirect to the frontend with a
//     one-time code (2 minutes) instead of tokens, so no token ever appears in a URL
//  3. POST /api/auth/google/exchange {code, binding} -> tokens, only if hash(binding) matches step 1, so a
//     code captured from someone else's sign-in cannot log a victim's browser into that account.
// Enabled only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.

const (
	oauthCookie    = "ft_oauth"
	oauthCookieTTL = 10 * time.Minute
	oauthCodeTTL   = 2 * time.Minute
)

var (
	googleMu       sync.Mutex
	googleProvider *oidc.Provider
)

func googleEnabled() bool {
	return os.Getenv("GOOGLE_CLIENT_ID") != "" && os.Getenv("GOOGLE_CLIENT_SECRET") != ""
}

func apiBaseURL() string {
	if v := strings.TrimRight(os.Getenv("API_BASE_URL"), "/"); v != "" {
		return v
	}
	return "http://localhost:4000"
}

func googleConfig(ctx context.Context) (*oauth2.Config, *oidc.Provider, error) {
	googleMu.Lock()
	defer googleMu.Unlock()
	if googleProvider == nil {
		// Discovery is fetched once; a failure is retried on the next request.
		p, err := oidc.NewProvider(context.WithoutCancel(ctx), "https://accounts.google.com")
		if err != nil {
			return nil, nil, err
		}
		googleProvider = p
	}
	return &oauth2.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		Endpoint:     googleProvider.Endpoint(),
		RedirectURL:  apiBaseURL() + "/api/auth/google/callback",
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}, googleProvider, nil
}

type oauthState struct {
	State       string    `json:"s"`
	Verifier    string    `json:"v"`
	Nonce       string    `json:"n"`
	Next        string    `json:"r"`
	BindingHash string    `json:"b"`
	Expires     time.Time `json:"e"`
}

func signValue(payload []byte) string {
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte("oauth-state:"))
	mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func readSignedValue(v string) ([]byte, bool) {
	parts := strings.SplitN(v, ".", 2)
	if len(parts) != 2 {
		return nil, false
	}
	payload, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	sig, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	if err1 != nil || err2 != nil {
		return nil, false
	}
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte("oauth-state:"))
	mac.Write(payload)
	return payload, hmac.Equal(sig, mac.Sum(nil))
}

func randomString() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// safeNext keeps post-login redirects on the frontend: only plain same-site paths are allowed
// (no scheme, host, backslashes, or control/space characters that browsers may normalize away).
func safeNext(next string) string {
	if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") || len(next) > 512 {
		return "/"
	}
	for _, r := range next {
		if r <= 0x20 || r == 0x7f || r == '\\' {
			return "/"
		}
	}
	return next
}

func setOAuthCookie(c *gin.Context, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: oauthCookie, Value: value, Path: "/api/auth/google", MaxAge: maxAge,
		HttpOnly: true, Secure: strings.HasPrefix(apiBaseURL(), "https://"), SameSite: http.SameSiteLaxMode,
	})
}

func redirectToApp(c *gin.Context, path string, params map[string]string) {
	c.Redirect(http.StatusFound, appLink(path, params))
}

func googleStart(c *gin.Context) {
	if !googleEnabled() {
		responseError(c, "Google sign-in is not configured", 404)
		return
	}
	cfg, _, err := googleConfig(c)
	if err != nil {
		abortServerError(c, err)
		return
	}
	binding := c.Query("binding")
	if len(binding) < 16 || len(binding) > 256 {
		responseError(c, "binding is required", 400)
		return
	}
	st := oauthState{State: randomString(), Verifier: oauth2.GenerateVerifier(), Nonce: randomString(),
		Next: safeNext(c.Query("next")), BindingHash: hashInviteToken(binding), Expires: time.Now().Add(oauthCookieTTL)}
	payload, _ := json.Marshal(st)
	setOAuthCookie(c, signValue(payload), int(oauthCookieTTL.Seconds()))
	c.Redirect(http.StatusFound, cfg.AuthCodeURL(st.State, oauth2.S256ChallengeOption(st.Verifier),
		oidc.Nonce(st.Nonce), oauth2.SetAuthURLParam("prompt", "select_account")))
}

func googleCallback(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/googleCallback").End()
	fail := func(reason string) { redirectToApp(c, "/auth/login", map[string]string{"error": reason}) }
	if !googleEnabled() {
		responseError(c, "Google sign-in is not configured", 404)
		return
	}
	raw, _ := c.Cookie(oauthCookie)
	setOAuthCookie(c, "", -1)
	payload, ok := readSignedValue(raw)
	var st oauthState
	if !ok || json.Unmarshal(payload, &st) != nil || time.Now().After(st.Expires) ||
		subtle.ConstantTimeCompare([]byte(st.State), []byte(c.Query("state"))) != 1 {
		fail("google_state")
		return
	}
	if c.Query("error") != "" || c.Query("code") == "" {
		fail("google_cancelled")
		return
	}
	cfg, provider, err := googleConfig(c)
	if err != nil {
		fail("google_unavailable")
		return
	}
	ctx, cancel := context.WithTimeout(c, 15*time.Second)
	defer cancel()
	tok, err := cfg.Exchange(ctx, c.Query("code"), oauth2.VerifierOption(st.Verifier))
	if err != nil {
		fail("google_exchange")
		return
	}
	rawID, _ := tok.Extra("id_token").(string)
	idToken, err := provider.Verifier(&oidc.Config{ClientID: cfg.ClientID}).Verify(ctx, rawID)
	if err != nil || subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(st.Nonce)) != 1 {
		fail("google_token")
		return
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil || claims.Email == "" || !claims.EmailVerified {
		fail("google_email_unverified")
		return
	}
	user, err := googleSignIn(c, idToken.Subject, claims.Email, claims.Name)
	if errors.Is(err, errGoogleConflict) {
		fail("google_conflict")
		return
	}
	if err != nil {
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		fail("google_account")
		return
	}
	code, err := issueBoundAuthToken(c, user.ID, "oauth_login", "", st.BindingHash, oauthCodeTTL)
	if err != nil {
		fail("google_account")
		return
	}
	redirectToApp(c, "/auth/google/complete", map[string]string{"code": code, "next": st.Next})
}

var errGoogleConflict = errors.New("email belongs to an account linked to another Google identity")

// googleSignIn finds the account for a verified Google identity, linking or creating it. An account whose
// email is verified is linked as is. A pending signup for the address (never usable, so it holds no data)
// is taken over: its password is cleared, because Google just proved who owns the address.
// An account already linked to a different Google identity is never re-linked.
func googleSignIn(ctx context.Context, sub, email, name string) (*User, error) {
	email = normalizeEmail(email)
	var out *User
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row userRow
		err := tx.Where("google_sub = ?", sub).First(&row).Error
		if err == nil {
			out = row.toModel()
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		err = tx.Where("lower(email) = ?", email).First(&row).Error
		if err == nil {
			if row.GoogleSub != nil {
				return errGoogleConflict
			}
			updates := map[string]any{"google_sub": sub}
			if row.EmailVerifiedAt == nil {
				updates["email_verified_at"] = time.Now()
				updates["password"] = ""
				if err := revokeSessionsTx(tx, row.ID, ""); err != nil {
					return err
				}
				if err := invalidateAuthTokens(tx, row.ID, "verify_email"); err != nil {
					return err
				}
			}
			if err := tx.Model(&userRow{}).Where("id = ?", row.ID).Updates(updates).Error; err != nil {
				return err
			}
			linked, err := loadLiveUser(tx, row.ID)
			out = linked
			return err
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if n, ok := validName(name); ok {
			name = n
		} else {
			name = strings.SplitN(email, "@", 2)[0]
		}
		now := time.Now()
		row = userRow{Name: name, Email: &email, EmailVerifiedAt: &now, GoogleSub: &sub, Role: string(RoleUser)}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		out = row.toModel()
		return nil
	})
	return out, err
}

func googleExchange(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/googleExchange").End()
	var body struct {
		Code    string `json:"code"`
		Binding string `json:"binding"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Code == "" || body.Binding == "" {
		responseError(c, "Invalid request body", 400)
		return
	}
	var user *User
	err := DB.WithContext(c).Transaction(func(tx *gorm.DB) error {
		tok, err := consumeAuthToken(tx, body.Code, "oauth_login")
		if err != nil {
			return err
		}
		if tok.BindingHash == nil || subtle.ConstantTimeCompare([]byte(*tok.BindingHash), []byte(hashInviteToken(body.Binding))) != 1 {
			return errTokenInvalid // a code from a sign-in this browser did not start
		}
		user, err = loadLiveUser(tx, tok.UserID)
		if err != nil {
			return errTokenInvalid
		}
		return nil
	})
	if errors.Is(err, errTokenInvalid) {
		responseError(c, "This sign-in link is invalid or has expired", 410)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	pair, err := createSession(c, user, c.Request.UserAgent(), clientIP(c), true)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, pair, 200)
}

// googleStatus lets the frontend decide whether to show the Google button.
func googleStatus(c *gin.Context) {
	responseSuccess(c, gin.H{"google": googleEnabled()}, 200)
}
