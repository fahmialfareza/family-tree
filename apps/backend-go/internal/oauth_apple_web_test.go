package app

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
)

// fakeAppleKeys serves a JWKS for key and points the cached Apple provider at it for the test.
func fakeAppleKeys(t *testing.T, key *rsa.PrivateKey) {
	t.Helper()
	b64 := base64.RawURLEncoding.EncodeToString
	jwks, _ := json.Marshal(map[string]any{"keys": []map[string]string{{
		"kty": "RSA", "kid": "test", "use": "sig", "alg": "RS256",
		"n": b64(key.N.Bytes()), "e": b64(big.NewInt(int64(key.E)).Bytes()),
	}}})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(jwks) }))
	t.Cleanup(srv.Close)
	p := (&oidc.ProviderConfig{IssuerURL: appleIssuer, JWKSURL: srv.URL, Algorithms: []string{"RS256"}}).NewProvider(context.Background())
	appleMu.Lock()
	prev := appleProvider
	appleProvider = p
	appleMu.Unlock()
	t.Cleanup(func() { appleMu.Lock(); appleProvider = prev; appleMu.Unlock() })
}

func TestAppleWebSignIn(t *testing.T) {
	resetDB(t)
	t.Setenv("APPLE_CLIENT_IDS", "com.example.app,com.example.web")
	t.Setenv("APPLE_SERVICES_ID", "com.example.web")
	t.Setenv("MOBILE_APP_SCHEME", "com.example.sakdulur")
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	fakeAppleKeys(t, key)
	binding := strings.Repeat("b", 32)

	start := func(query string) (*url.URL, oauthState, string) {
		t.Helper()
		rec := httptest.NewRecorder()
		testRouter.ServeHTTP(rec, httptest.NewRequest("GET", "/api/auth/apple/start?binding="+binding+query, nil))
		loc, _ := url.Parse(rec.Header().Get("Location"))
		if rec.Code != http.StatusFound || loc == nil || loc.Host != "appleid.apple.com" {
			t.Fatalf("start: %d %q", rec.Code, rec.Header().Get("Location"))
		}
		cookie := rec.Header().Get("Set-Cookie")
		if !strings.Contains(cookie, "SameSite=None") || !strings.Contains(cookie, "Secure") || !strings.Contains(cookie, "HttpOnly") {
			t.Errorf("state cookie must be SameSite=None; Secure; HttpOnly for Apple's form POST: %q", cookie)
		}
		raw := strings.TrimPrefix(strings.SplitN(cookie, ";", 2)[0], appleOAuthCookie+"=")
		var st oauthState
		payload, ok := readSignedValue(raw)
		if !ok || json.Unmarshal(payload, &st) != nil {
			t.Fatalf("state cookie not readable")
		}
		return loc, st, raw
	}
	sign := func(nonce string, claims jwt.MapClaims) string {
		sum := sha256.Sum256([]byte(nonce))
		base := jwt.MapClaims{"iss": appleIssuer, "sub": "apple-web-1", "aud": "com.example.web",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(), "nonce": hex.EncodeToString(sum[:]),
			"email": "siti@example.com", "email_verified": "true"}
		for k, v := range claims {
			base[k] = v
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodRS256, base)
		tok.Header["kid"] = "test"
		s, err := tok.SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	callback := func(origin, cookie string, form url.Values) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", appleCallbackPath, strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Origin", origin)
		if cookie != "" {
			req.Header.Set("Cookie", appleOAuthCookie+"="+cookie)
		}
		rec := httptest.NewRecorder()
		testRouter.ServeHTTP(rec, req)
		return rec
	}

	loc, st, cookie := start("&next=/app/t/x")
	q := loc.Query()
	sum := sha256.Sum256([]byte(st.Nonce))
	if q.Get("client_id") != "com.example.web" || q.Get("response_mode") != "form_post" || q.Get("scope") != "name email" ||
		q.Get("redirect_uri") != apiBaseURL()+appleCallbackPath || q.Get("state") != st.State || q.Get("nonce") != hex.EncodeToString(sum[:]) {
		t.Errorf("authorize URL: %v", q)
	}

	// Apple posts back from its own origin; the name comes only on the first sign-in.
	form := url.Values{"state": {st.State}, "code": {"c"}, "id_token": {sign(st.Nonce, nil)},
		"user": {`{"name":{"firstName":"Siti","lastName":"Aminah"},"email":"siti@example.com"}`}}
	rec := callback(appleOrigin, cookie, form)
	done, _ := url.Parse(rec.Header().Get("Location"))
	if rec.Code != http.StatusFound || done == nil || done.Path != "/auth/apple/complete" || done.Query().Get("next") != "/app/t/x" {
		t.Fatalf("callback: %d %q", rec.Code, rec.Header().Get("Location"))
	}
	var row userRow
	if err := DB.Where("apple_sub = ?", "apple-web-1").First(&row).Error; err != nil || row.Name != "Siti Aminah" || row.Email == nil || *row.Email != "siti@example.com" {
		t.Fatalf("user not created as expected: %+v %v", row, err)
	}
	ex := call(t, "", "POST", "/api/auth/google/exchange", map[string]string{"code": done.Query().Get("code"), "binding": binding})
	if ex.Status != 200 || dataMap(ex)["accessToken"] == nil {
		t.Fatalf("exchange: %d %v", ex.Status, ex.Body)
	}

	// The state must match and the token's nonce must be this sign-in's. (A replayed callback only yields a
	// code bound to this browser's binding value, as for Google, and the browser drops the cookie anyway.)
	_, st2, cookie2 := start("")
	if loc := callback(appleOrigin, cookie2, url.Values{"state": {"wrong"}, "id_token": {sign(st2.Nonce, nil)}}).Header().Get("Location"); !strings.Contains(loc, "error=apple_state") {
		t.Errorf("wrong state: %q", loc)
	}
	_, st3, cookie3 := start("")
	if loc := callback(appleOrigin, cookie3, url.Values{"state": {st3.State}, "id_token": {sign("other", nil)}}).Header().Get("Location"); !strings.Contains(loc, "error=apple_token") {
		t.Errorf("foreign nonce: %q", loc)
	}

	// Apps without the native sheet finish through the URL scheme, like Google.
	_, st4, cookie4 := start("&client=app")
	if loc := callback(appleOrigin, cookie4, url.Values{"state": {st4.State}, "error": {"user_cancelled_authorize"}}).Header().Get("Location"); !strings.HasPrefix(loc, "com.example.sakdulur://auth/login?error=apple_cancelled") {
		t.Errorf("app flow: %q", loc)
	}

	// CORS (full router) lets Apple's origin through on the callback only.
	full, err := NewRouter(nil)
	if err != nil {
		t.Fatal(err)
	}
	cors := func(origin, method, path string) int {
		req := httptest.NewRequest(method, path, strings.NewReader("state=x"))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Origin", origin)
		rec := httptest.NewRecorder()
		full.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := cors(appleOrigin, "POST", appleCallbackPath); code == http.StatusForbidden {
		t.Errorf("Apple's form POST was blocked by CORS")
	}
	if code := cors("https://evil.example", "POST", appleCallbackPath); code != http.StatusForbidden {
		t.Errorf("other origin on the callback: %d", code)
	}
	if code := cors(appleOrigin, "POST", "/api/auth/apple"); code != http.StatusForbidden {
		t.Errorf("Apple's origin on another route: %d", code)
	}

	// Without the Services ID among the accepted client ids, the web flow is off.
	t.Setenv("APPLE_CLIENT_IDS", "com.example.app")
	rec = httptest.NewRecorder()
	testRouter.ServeHTTP(rec, httptest.NewRequest("GET", "/api/auth/apple/start?binding="+binding, nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("disabled web flow: %d", rec.Code)
	}
}
