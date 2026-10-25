package app

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestAppleIdentityToken(t *testing.T) {
	t.Setenv("APPLE_CLIENT_IDS", "com.example.familytree, com.example.web")
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	verifier := oidc.NewVerifier(appleIssuer, &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}},
		&oidc.Config{SkipClientIDCheck: true})
	hashed := func(n string) string { s := sha256.Sum256([]byte(n)); return hex.EncodeToString(s[:]) }
	sign := func(claims jwt.MapClaims) string {
		base := jwt.MapClaims{"iss": appleIssuer, "sub": "apple-1", "aud": "com.example.familytree",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(), "nonce": hashed("raw-nonce"),
			"email": "Someone@Privaterelay.appleid.com", "email_verified": "true"}
		for k, v := range claims {
			base[k] = v
		}
		s, err := jwt.NewWithClaims(jwt.SigningMethodRS256, base).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	ctx := context.Background()

	id, err := verifyAppleToken(ctx, verifier, sign(nil), "raw-nonce")
	if err != nil || id.Subject != "apple-1" || id.ClientID != "com.example.familytree" {
		t.Fatalf("valid token: %+v %v", id, err)
	}
	if id, err := verifyAppleToken(ctx, verifier, sign(jwt.MapClaims{"email_verified": true, "aud": "com.example.web"}), "raw-nonce"); err != nil || id.ClientID != "com.example.web" {
		t.Errorf("boolean email_verified / second client id: %+v %v", id, err)
	}
	bad := map[string]struct {
		token, nonce string
		want         error
	}{
		"wrong nonce":        {sign(nil), "other-nonce", errAppleToken},
		"no nonce":           {sign(nil), "", errAppleToken},
		"raw nonce in token": {sign(jwt.MapClaims{"nonce": "raw-nonce"}), "raw-nonce", errAppleToken},
		"other audience":     {sign(jwt.MapClaims{"aud": "com.attacker.app"}), "raw-nonce", errAppleToken},
		"other issuer":       {sign(jwt.MapClaims{"iss": "https://evil.example"}), "raw-nonce", errAppleToken},
		"expired":            {sign(jwt.MapClaims{"exp": time.Now().Add(-time.Hour).Unix()}), "raw-nonce", errAppleToken},
		"unverified email":   {sign(jwt.MapClaims{"email_verified": "false"}), "raw-nonce", errAppleEmail},
		"no email":           {sign(jwt.MapClaims{"email": ""}), "raw-nonce", errAppleEmail},
	}
	for name, tc := range bad {
		if _, err := verifyAppleToken(ctx, verifier, tc.token, tc.nonce); err != tc.want {
			t.Errorf("%s: got %v, want %v", name, err, tc.want)
		}
	}
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	forged, _ := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{"iss": appleIssuer, "sub": "x",
		"aud": "com.example.familytree", "exp": time.Now().Add(time.Hour).Unix(), "nonce": hashed("raw-nonce"),
		"email": "a@b.c", "email_verified": true}).SignedString(other)
	if _, err := verifyAppleToken(ctx, verifier, forged, "raw-nonce"); err != errAppleToken {
		t.Errorf("token signed by another key: %v", err)
	}
}

func TestAppleSignInLinking(t *testing.T) {
	resetDB(t)
	ctx := context.Background()

	u, err := providerSignIn(ctx, "apple_sub", "a-1", "relay@privaterelay.appleid.com", "Apple Person")
	if err != nil || !u.AppleLinked || u.GoogleLinked || u.HasPassword || !u.EmailVerified || u.Name != "Apple Person" {
		t.Fatalf("new apple user: %+v %v", u, err)
	}
	if again, _ := providerSignIn(ctx, "apple_sub", "a-1", "relay@privaterelay.appleid.com", ""); again.ID != u.ID {
		t.Error("same Apple subject must map to the same account")
	}
	if _, err := providerSignIn(ctx, "apple_sub", "a-2", "relay@privaterelay.appleid.com", ""); err != errGoogleConflict {
		t.Errorf("re-link to another Apple ID: %v", err)
	}
	// A Google account with the same verified email gets Apple linked too; both identities reach it.
	g, _ := googleSignIn(ctx, "g-1", "both@example.com", "Both")
	a, err := providerSignIn(ctx, "apple_sub", "a-3", "both@example.com", "")
	if err != nil || a.ID != g.ID || !a.AppleLinked || !a.GoogleLinked {
		t.Errorf("link apple to google account: %+v %v", a, err)
	}
	if _, err := providerSignIn(ctx, "password", "x", "x@example.com", ""); err == nil {
		t.Error("unknown provider column accepted")
	}

	// Deleting the account removes it; revocation is skipped without an Apple key and must not fail.
	if err := deleteAccount(ctx, u.ID); err != nil {
		t.Fatalf("delete apple account: %v", err)
	}
	if _, err := loadLiveUser(DB, u.ID); err == nil {
		t.Error("account still exists after deletion")
	}
	// Without APPLE_CLIENT_IDS the endpoint is off.
	t.Setenv("APPLE_CLIENT_IDS", "")
	expectStatus(t, "", 404, []routeCase{{"POST", "/api/auth/apple", map[string]any{"identityToken": "x", "nonce": "y"}}})
}

func TestGoogleCallbackReturnsToMobileApp(t *testing.T) {
	t.Setenv("GOOGLE_CLIENT_ID", "id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "secret")
	for _, bad := range []string{"https", "javascript", "bad scheme", "a/b", ""} {
		t.Setenv("MOBILE_APP_SCHEME", bad)
		if mobileAppScheme() != "" {
			t.Errorf("scheme %q accepted", bad)
		}
	}
	t.Setenv("MOBILE_APP_SCHEME", "com.example.familytree")

	callback := func(st oauthState, state string) string {
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/api/auth/google/callback?state="+state+"&error=access_denied", nil)
		payload, _ := json.Marshal(st)
		c.Request.Header.Set("Cookie", oauthCookie+"="+signValue(payload))
		googleCallback(c)
		return w.Header().Get("Location")
	}
	st := oauthState{State: "s1", Expires: time.Now().Add(time.Minute), App: true}
	if loc := callback(st, "s1"); !strings.HasPrefix(loc, "com.example.familytree://auth/login?error=google_cancelled") {
		t.Errorf("app flow should return through the URL scheme, got %q", loc)
	}
	st.App = false
	if loc := callback(st, "s1"); !strings.HasPrefix(loc, appBaseURL+"/auth/login?error=google_cancelled") {
		t.Errorf("web flow should return to the website, got %q", loc)
	}
	// A state that fails verification must not be able to steer the redirect into the app scheme.
	st.App = true
	if loc := callback(st, "wrong"); !strings.HasPrefix(loc, appBaseURL+"/auth/login?error=google_state") {
		t.Errorf("unverified state redirected to %q", loc)
	}
}
