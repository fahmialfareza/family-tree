package app

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// Sign in with Apple on the web, and in the apps that have no native Apple sheet (Windows, Linux, Android),
// which open it in the system browser like Google sign-in:
//  1. GET  /api/auth/apple/start?binding=B&next=/path[&client=app] -> redirect to Apple. State, nonce and
//     hash(B) live in a signed cookie, SameSite=None because Apple returns with a cross-site form POST
//     (response_mode=form_post), which Lax cookies are not sent with; so this only works over HTTPS.
//  2. POST /api/auth/apple/callback (form: code, id_token, state, user) -> verify the identity token, sign in,
//     redirect to the frontend (or the app's URL scheme) with a one-time code
//  3. POST /api/auth/google/exchange {code, binding} -> tokens, exactly as for Google
//
// Enabled when APPLE_SERVICES_ID (the Services ID configured for the website) is set and also listed in
// APPLE_CLIENT_IDS. The iPhone and Mac apps use the native sheet instead (POST /api/auth/apple).

const (
	appleOrigin       = "https://appleid.apple.com"
	appleCallbackPath = "/api/auth/apple/callback"
	appleOAuthCookie  = "ft_oauth_apple"
)

func appleServicesID() string { return strings.TrimSpace(os.Getenv("APPLE_SERVICES_ID")) }

func appleWebEnabled() bool {
	id := appleServicesID()
	return id != "" && slices.Contains(appleClientIDs(), id)
}

func setAppleOAuthCookie(c *gin.Context, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: appleOAuthCookie, Value: value, Path: "/api/auth/apple", MaxAge: maxAge,
		HttpOnly: true, Secure: true, SameSite: http.SameSiteNoneMode,
	})
}

func appleWebStart(c *gin.Context) {
	if !appleWebEnabled() {
		responseError(c, "Sign in with Apple is not configured", 404)
		return
	}
	binding := c.Query("binding")
	if len(binding) < 16 || len(binding) > 256 {
		responseError(c, "binding is required", 400)
		return
	}
	nonce := randomString()
	st := oauthState{State: randomString(), Nonce: nonce, Next: safeNext(c.Query("next")),
		BindingHash: hashInviteToken(binding), Expires: time.Now().Add(oauthCookieTTL),
		App: c.Query("client") == "app" && mobileAppScheme() != ""}
	payload, _ := json.Marshal(st)
	setAppleOAuthCookie(c, signValue(payload), int(oauthCookieTTL.Seconds()))
	// Apple puts the nonce in the identity token as sent; we send its SHA-256, as the native apps do, so
	// verifyAppleToken checks both the same way.
	sum := sha256.Sum256([]byte(nonce))
	q := url.Values{
		"client_id":     {appleServicesID()},
		"redirect_uri":  {apiBaseURL() + appleCallbackPath},
		"response_type": {"code id_token"},
		"response_mode": {"form_post"},
		"scope":         {"name email"},
		"state":         {st.State},
		"nonce":         {hex.EncodeToString(sum[:])},
	}
	c.Redirect(http.StatusFound, appleOrigin+"/auth/authorize?"+q.Encode())
}

// appleUserName reads the name Apple posts once, on the first sign-in only: {"name":{"firstName","lastName"}}.
func appleUserName(raw string) string {
	var u struct {
		Name struct {
			FirstName string `json:"firstName"`
			LastName  string `json:"lastName"`
		} `json:"name"`
	}
	if len(raw) > 4096 || json.Unmarshal([]byte(raw), &u) != nil {
		return ""
	}
	return strings.TrimSpace(u.Name.FirstName + " " + u.Name.LastName)
}

func appleWebCallback(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/appleWebCallback").End()
	var st oauthState
	finish := func(path string, params map[string]string) {
		if st.App {
			redirectToMobileApp(c, path, params)
		} else {
			redirectToApp(c, path, params)
		}
	}
	fail := func(reason string) { finish("/auth/login", map[string]string{"error": reason}) }
	if !appleWebEnabled() {
		responseError(c, "Sign in with Apple is not configured", 404)
		return
	}
	raw, _ := c.Cookie(appleOAuthCookie)
	setAppleOAuthCookie(c, "", -1)
	payload, ok := readSignedValue(raw)
	if !ok || json.Unmarshal(payload, &st) != nil || time.Now().After(st.Expires) ||
		subtle.ConstantTimeCompare([]byte(st.State), []byte(c.PostForm("state"))) != 1 {
		st = oauthState{} // unverified state: never trust its App flag
		fail("apple_state")
		return
	}
	if c.PostForm("error") != "" || c.PostForm("id_token") == "" {
		fail("apple_cancelled")
		return
	}
	provider, err := appleOIDC(c)
	if err != nil {
		fail("apple_unavailable")
		return
	}
	ctx, cancel := context.WithTimeout(c, 15*time.Second)
	defer cancel()
	verifier := provider.Verifier(&oidc.Config{ClientID: appleServicesID()})
	id, err := verifyAppleToken(ctx, verifier, c.PostForm("id_token"), st.Nonce)
	if errors.Is(err, errAppleEmail) {
		fail("apple_email")
		return
	}
	if err != nil {
		fail("apple_token")
		return
	}
	user, err := providerSignIn(c, "apple_sub", id.Subject, id.Email, appleUserName(c.PostForm("user")))
	if errors.Is(err, errGoogleConflict) {
		fail("apple_conflict")
		return
	}
	if err != nil {
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		fail("apple_account")
		return
	}
	// Keep a refresh token so the Apple link can be revoked when the account is deleted.
	if code := c.PostForm("code"); code != "" && appleKeyConfigured() {
		if refresh, err := appleExchangeCode(ctx, id.ClientID, code); err != nil {
			slog.WarnContext(c, "apple code exchange failed", "request_id", requestID(c), "error", err)
		} else if refresh != "" {
			DB.WithContext(c).Model(&userRow{}).Where("id = ?", user.ID).
				Updates(map[string]any{"apple_client_id": id.ClientID, "apple_refresh_token": refresh})
		}
	}
	code, err := issueBoundAuthToken(c, user.ID, "oauth_login", "", st.BindingHash, oauthCodeTTL)
	if err != nil {
		fail("apple_account")
		return
	}
	finish("/auth/apple/complete", map[string]string{"code": code, "next": st.Next})
}
