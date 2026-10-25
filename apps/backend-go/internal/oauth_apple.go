package app

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// Sign in with Apple, native flow (iOS app):
//   - the app asks Apple for an identity token with nonce = sha256(N), N being a random value it keeps
//   - POST /api/auth/apple {identityToken, nonce: N, authorizationCode?, name?} -> tokens
//
// The identity token is verified against Apple's keys; its audience must be one of APPLE_CLIENT_IDS (the
// iOS bundle id, plus a Services ID if a web flow is added later). Apple sends the user's name only on the
// very first sign-in, so the app forwards it. When APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY are set,
// the authorization code is exchanged for an Apple refresh token so it can be revoked when the account is
// deleted (an App Store requirement).

const appleIssuer = "https://appleid.apple.com"

var (
	appleMu       sync.Mutex
	appleProvider *oidc.Provider
	appleHTTP     = &http.Client{Timeout: 15 * time.Second}
)

func appleClientIDs() []string {
	var out []string
	for _, v := range strings.Split(os.Getenv("APPLE_CLIENT_IDS"), ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func appleEnabled() bool { return len(appleClientIDs()) > 0 }

func appleOIDC(ctx context.Context) (*oidc.Provider, error) {
	appleMu.Lock()
	defer appleMu.Unlock()
	if appleProvider == nil {
		p, err := oidc.NewProvider(context.WithoutCancel(ctx), appleIssuer)
		if err != nil {
			return nil, err
		}
		appleProvider = p
	}
	return appleProvider, nil
}

// appleIdentity is what a verified identity token tells us.
type appleIdentity struct {
	Subject  string
	Email    string
	ClientID string
}

var errAppleToken = errors.New("invalid Apple identity token")

// verifyAppleToken checks signature, issuer, expiry, audience and nonce of an Apple identity token.
func verifyAppleToken(ctx context.Context, verifier *oidc.IDTokenVerifier, raw, nonce string) (*appleIdentity, error) {
	tok, err := verifier.Verify(ctx, raw)
	if err != nil {
		return nil, errAppleToken
	}
	allowed := appleClientIDs()
	clientID := ""
	for _, aud := range tok.Audience {
		if slices.Contains(allowed, aud) {
			clientID = aud
			break
		}
	}
	if clientID == "" {
		return nil, errAppleToken
	}
	sum := sha256.Sum256([]byte(nonce))
	if nonce == "" || subtle.ConstantTimeCompare([]byte(tok.Nonce), []byte(hex.EncodeToString(sum[:]))) != 1 {
		return nil, errAppleToken
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"` // Apple sends "true" (string) or true
	}
	if err := tok.Claims(&claims); err != nil {
		return nil, errAppleToken
	}
	verified := claims.EmailVerified == true || claims.EmailVerified == "true"
	if claims.Email == "" || !verified {
		return nil, errAppleEmail
	}
	return &appleIdentity{Subject: tok.Subject, Email: claims.Email, ClientID: clientID}, nil
}

var errAppleEmail = errors.New("apple did not share a verified email")

func appleSignIn(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/appleSignIn").End()
	if !appleEnabled() {
		responseError(c, "Sign in with Apple is not configured", 404)
		return
	}
	var body struct {
		IdentityToken     string `json:"identityToken"`
		Nonce             string `json:"nonce"`
		AuthorizationCode string `json:"authorizationCode"`
		Name              string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.IdentityToken == "" || body.Nonce == "" ||
		len(body.IdentityToken) > 8192 || len(body.Nonce) > 256 || len(body.AuthorizationCode) > 1024 {
		responseError(c, "Invalid request body", 400)
		return
	}
	provider, err := appleOIDC(c)
	if err != nil {
		abortServerError(c, err)
		return
	}
	ctx, cancel := context.WithTimeout(c, 15*time.Second)
	defer cancel()
	// Audience is checked in verifyAppleToken because more than one client id may be accepted.
	verifier := provider.Verifier(&oidc.Config{SkipClientIDCheck: true})
	id, err := verifyAppleToken(ctx, verifier, body.IdentityToken, body.Nonce)
	if errors.Is(err, errAppleEmail) {
		responseError(c, "Apple did not share a verified email address", 400)
		return
	}
	if err != nil {
		responseError(c, "This Apple sign-in is invalid or has expired", 401)
		return
	}
	user, err := providerSignIn(c, "apple_sub", id.Subject, id.Email, body.Name)
	if errors.Is(err, errGoogleConflict) {
		responseError(c, "This email belongs to an account linked to another Apple ID", 409)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	if body.AuthorizationCode != "" && appleKeyConfigured() {
		if refresh, err := appleExchangeCode(ctx, id.ClientID, body.AuthorizationCode); err != nil {
			slog.WarnContext(c, "apple code exchange failed", "request_id", requestID(c), "error", err)
		} else if refresh != "" {
			DB.WithContext(c).Model(&userRow{}).Where("id = ?", user.ID).
				Updates(map[string]any{"apple_client_id": id.ClientID, "apple_refresh_token": refresh})
		}
	}
	pair, err := createSession(c, user, c.Request.UserAgent(), clientIP(c), true)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, pair, 200)
}

func appleKeyConfigured() bool {
	return os.Getenv("APPLE_TEAM_ID") != "" && os.Getenv("APPLE_KEY_ID") != "" && os.Getenv("APPLE_PRIVATE_KEY") != ""
}

// appleClientSecret is the short-lived ES256 JWT Apple expects instead of a static client secret.
func appleClientSecret(clientID string) (string, error) {
	pem := strings.ReplaceAll(os.Getenv("APPLE_PRIVATE_KEY"), `\n`, "\n")
	key, err := jwt.ParseECPrivateKeyFromPEM([]byte(pem))
	if err != nil {
		return "", fmt.Errorf("APPLE_PRIVATE_KEY: %w", err)
	}
	now := time.Now()
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.RegisteredClaims{
		Issuer:    os.Getenv("APPLE_TEAM_ID"),
		Subject:   clientID,
		Audience:  jwt.ClaimStrings{appleIssuer},
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
	})
	tok.Header["kid"] = os.Getenv("APPLE_KEY_ID")
	return tok.SignedString(key)
}

func applePost(ctx context.Context, path string, form url.Values) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, appleIssuer+path, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return appleHTTP.Do(req)
}

func appleExchangeCode(ctx context.Context, clientID, code string) (string, error) {
	secret, err := appleClientSecret(clientID)
	if err != nil {
		return "", err
	}
	res, err := applePost(ctx, "/auth/token", url.Values{
		"client_id": {clientID}, "client_secret": {secret}, "code": {code}, "grant_type": {"authorization_code"},
	})
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("apple token endpoint: %s", res.Status)
	}
	var out struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.RefreshToken, nil
}

// revokeAppleToken tells Apple the account is gone. Best effort: the account is already deleted locally.
func revokeAppleToken(ctx context.Context, clientID, refresh string) {
	if clientID == "" || refresh == "" || !appleKeyConfigured() {
		return
	}
	secret, err := appleClientSecret(clientID)
	if err == nil {
		var res *http.Response
		res, err = applePost(ctx, "/auth/revoke", url.Values{
			"client_id": {clientID}, "client_secret": {secret}, "token": {refresh}, "token_type_hint": {"refresh_token"},
		})
		if err == nil {
			res.Body.Close()
			if res.StatusCode != http.StatusOK {
				err = fmt.Errorf("apple revoke endpoint: %s", res.Status)
			}
		}
	}
	if err != nil {
		slog.WarnContext(ctx, "apple token revocation failed", "error", err)
	}
}
