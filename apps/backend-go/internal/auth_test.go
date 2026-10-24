package app

import (
	"context"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// captureMailer records outgoing emails so tests can follow verification/reset links.
type captureMailer struct {
	mu   sync.Mutex
	sent []Email
}

var testMail = &captureMailer{}

func (m *captureMailer) Send(_ context.Context, msg Email) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, msg)
	return nil
}

func (m *captureMailer) reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = nil
}

func (m *captureMailer) count(to string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, e := range m.sent {
		if e.To == to {
			n++
		}
	}
	return n
}

// waitToken waits for the n-th (1-based) email to `to` whose link contains path, and returns its token.
func (m *captureMailer) waitToken(t *testing.T, to, path string, n int) string {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		m.mu.Lock()
		seen := 0
		for _, e := range m.sent {
			if e.To != to {
				continue
			}
			for _, field := range strings.Fields(e.Text) {
				if u, err := url.Parse(field); err == nil && u.Path == path {
					seen++
					if seen == n {
						m.mu.Unlock()
						return u.Query().Get("token")
					}
				}
			}
		}
		m.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("no email #%d to %s with a %s link", n, to, path)
	return ""
}

func clearRateLimits() {
	if RedisClient == nil {
		return
	}
	ctx := context.Background()
	iter := RedisClient.Scan(ctx, 0, redisKeyPrefix+"rl:*", 100).Iterator()
	for iter.Next(ctx) {
		RedisClient.Del(ctx, iter.Val())
	}
}

// callToken is call() with an explicit bearer token.
func callToken(t *testing.T, token, method, path string, body any) response {
	t.Helper()
	return callWith(t, token, method, path, body)
}

func dataMap(r response) map[string]any {
	m, _ := r.data().(map[string]any)
	return m
}

func str(m map[string]any, k string) string {
	s, _ := m[k].(string)
	return s
}

const strongPassword = "correct horse battery"

// signupVerified signs up and completes email verification, returning the session's token pair.
func signupVerified(t *testing.T, name, email string) map[string]any {
	t.Helper()
	earlier := testMail.count(normalizeEmail(email)) // other emails may already be in this inbox
	if res := call(t, "", "POST", "/api/auth/signup", map[string]any{"name": name, "email": email, "password": strongPassword}); res.Status != 201 {
		t.Fatalf("signup %s: %d %v", email, res.Status, res.Body)
	}
	token := testMail.waitToken(t, normalizeEmail(email), "/auth/verify-email", earlier+1)
	res := call(t, "", "POST", "/api/auth/verify-email", map[string]any{"token": token, "password": strongPassword})
	session, _ := dataMap(res)["session"].(map[string]any)
	if res.Status != 200 || str(session, "accessToken") == "" {
		t.Fatalf("verify %s: %d %v", email, res.Status, res.Body)
	}
	return session
}

func TestSignupVerifyLoginRefreshLogout(t *testing.T) {
	resetDB(t)

	expectStatus(t, "", 400, []routeCase{
		{"POST", "/api/auth/signup", map[string]any{"name": "Nia", "email": "nia@example.com", "password": "short"}},
		{"POST", "/api/auth/signup", map[string]any{"name": "Nia", "email": "nia@example.com", "password": "password123"}},
		{"POST", "/api/auth/signup", map[string]any{"name": "Nia", "email": "not-an-email", "password": strongPassword}},
		{"POST", "/api/auth/signup", map[string]any{"name": " ", "email": "nia@example.com", "password": strongPassword}},
	})
	clearRateLimits() // the rejected attempts count toward the per-IP signup limit
	res := call(t, "", "POST", "/api/auth/signup", map[string]any{"name": "Nia", "email": "Nia@Example.com", "password": strongPassword})
	user, _ := dataMap(res)["user"].(map[string]any)
	if res.Status != 201 || dataMap(res)["verificationRequired"] != true || dataMap(res)["accessToken"] != nil ||
		user["email"] != "nia@example.com" || user["password"] != nil {
		t.Fatalf("signup: %d %v", res.Status, res.Body)
	}
	expectStatus(t, "", 409, []routeCase{{"POST", "/api/auth/signup", map[string]any{"name": "Nia", "email": "NIA@example.com", "password": strongPassword}}})

	// A pending account cannot sign in, and the link needs the signup password.
	expectStatus(t, "", 403, []routeCase{{"POST", "/api/auth/login", map[string]any{"identifier": "nia@example.com", "password": strongPassword}}})
	token := testMail.waitToken(t, "nia@example.com", "/auth/verify-email", 1)
	expectStatus(t, "", 403, []routeCase{{"POST", "/api/auth/verify-email", map[string]any{"token": token, "password": "not my password"}}})
	verified := call(t, "", "POST", "/api/auth/verify-email", map[string]any{"token": token, "password": strongPassword})
	pair, _ := dataMap(verified)["session"].(map[string]any)
	if verified.Status != 200 || str(pair, "refreshToken") == "" {
		t.Fatalf("verify: %d %v", verified.Status, verified.Body)
	}
	expectStatus(t, "", 410, []routeCase{{"POST", "/api/auth/verify-email", map[string]any{"token": token, "password": strongPassword}}})
	if u, _ := dataMap(callToken(t, str(pair, "accessToken"), "GET", "/api/me", nil))["user"].(map[string]any); u["emailVerified"] != true {
		t.Errorf("email not verified: %v", u)
	}

	// Login by email is case-insensitive; wrong passwords fail the same way as unknown accounts.
	expectStatus(t, "", 401, []routeCase{
		{"POST", "/api/auth/login", map[string]any{"identifier": "nia@example.com", "password": "wrong password!"}},
		{"POST", "/api/auth/login", map[string]any{"identifier": "nobody@example.com", "password": strongPassword}},
	})
	login := dataMap(call(t, "", "POST", "/api/auth/login", map[string]any{"identifier": "NIA@example.com", "password": strongPassword}))
	if str(login, "refreshToken") == "" {
		t.Fatalf("login: %v", login)
	}

	// Refresh rotates. Replaying the previous token right away (two tabs) fails without killing the
	// session; replaying it later revokes the session.
	rotated := dataMap(call(t, "", "POST", "/api/auth/refresh", map[string]any{"refreshToken": str(login, "refreshToken")}))
	if str(rotated, "refreshToken") == "" || str(rotated, "refreshToken") == str(login, "refreshToken") {
		t.Fatalf("refresh did not rotate: %v", rotated)
	}
	expectStatus(t, "", 401, []routeCase{{"POST", "/api/auth/refresh", map[string]any{"refreshToken": str(login, "refreshToken")}}})
	expectTokenStatus(t, str(rotated, "accessToken"), 200, "GET", "/api/me")
	DB.Exec("UPDATE sessions SET last_used_at = now() - interval '1 minute' WHERE prev_refresh_token_hash = ?", hashInviteToken(str(login, "refreshToken")))
	expectStatus(t, "", 401, []routeCase{{"POST", "/api/auth/refresh", map[string]any{"refreshToken": str(login, "refreshToken")}}})
	expectTokenStatus(t, str(rotated, "accessToken"), 401, "GET", "/api/me")
	expectStatus(t, "", 401, []routeCase{{"POST", "/api/auth/refresh", map[string]any{"refreshToken": str(rotated, "refreshToken")}}})

	// Logout ends the session immediately.
	access := str(pair, "accessToken")
	expectTokenStatus(t, access, 200, "POST", "/api/auth/logout")
	expectTokenStatus(t, access, 401, "GET", "/api/me")
}

func expectTokenStatus(t *testing.T, token string, want int, method, path string) {
	t.Helper()
	if got := callToken(t, token, method, path, nil); got.Status != want {
		t.Errorf("%s %s: got %d, want %d (%v)", method, path, got.Status, want, got.Body)
	}
}

func TestLegacySigninAndOldTokens(t *testing.T) {
	resetDB(t)
	// Family accounts from the Node.js backend have cost-10 hashes; they keep working and get upgraded.
	legacy, _ := bcrypt.GenerateFromPassword([]byte("legacy-pass-123"), 10)
	DB.Exec("UPDATE users SET password = ? WHERE id = ?", string(legacy), bob)
	bcryptCost = 11
	defer func() { bcryptCost = bcrypt.MinCost }()

	res := call(t, "", "POST", "/api/auth/signin", map[string]any{"username": bob, "password": "legacy-pass-123"})
	data := dataMap(res)
	token := str(data, "token")
	if res.Status != 200 || token == "" || data["refreshToken"] != nil {
		t.Fatalf("legacy signin: %d %v", res.Status, res.Body)
	}
	if u, _ := data["user"].(map[string]any); u["password"] != nil || u["username"] != bob {
		t.Errorf("legacy user payload = %v", u)
	}
	var stored string
	DB.Table("users").Select("password").Where("id = ?", bob).Scan(&stored)
	if cost, _ := bcrypt.Cost([]byte(stored)); cost != 11 {
		t.Errorf("legacy hash not upgraded: cost %d", cost)
	}
	expectTokenStatus(t, token, 200, "GET", "/api/person")
	expectTokenStatus(t, token, 200, "GET", "/api/auth")

	// Tokens minted before sessions existed ({"id","exp"}) are rejected, as are other algorithms.
	old, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"id": bob, "exp": time.Now().Add(time.Hour).Unix()}).SignedString(jwtSecret)
	expectTokenStatus(t, old, 401, "GET", "/api/person")
	none, _ := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{"sub": bob, "sid": "x", "typ": "access", "exp": time.Now().Add(time.Hour).Unix()}).SignedString(jwt.UnsafeAllowNoneSignatureType)
	expectTokenStatus(t, none, 401, "GET", "/api/person")

	// Per-account throttling of wrong passwords (only enforced with Redis).
	if RedisClient != nil {
		for i := 0; i < 10; i++ {
			call(t, "", "POST", "/api/auth/signin", map[string]any{"username": dave, "password": "wrong-password"})
		}
		if got := call(t, "", "POST", "/api/auth/signin", map[string]any{"username": dave, "password": "wrong-password"}); got.Status != 429 {
			t.Errorf("11th failed login: got %d, want 429", got.Status)
		}
	}
}

func TestPasswordResetFlow(t *testing.T) {
	resetDB(t)
	first := str(signupVerified(t, "Rani", "rani@example.com"), "accessToken")

	// Unknown emails get the same answer and no email.
	expectStatus(t, "", 200, []routeCase{
		{"POST", "/api/auth/forgot-password", map[string]any{"email": "ghost@example.com"}},
		{"POST", "/api/auth/forgot-password", map[string]any{"email": "rani@example.com"}},
	})
	token := testMail.waitToken(t, "rani@example.com", "/auth/reset-password", 1)
	if testMail.count("ghost@example.com") != 0 {
		t.Error("reset email sent to an unknown address")
	}

	// A weak password is refused without burning the token.
	expectStatus(t, "", 400, []routeCase{{"POST", "/api/auth/reset-password", map[string]any{"token": token, "password": "short"}}})
	expectStatus(t, "", 200, []routeCase{{"POST", "/api/auth/reset-password", map[string]any{"token": token, "password": "a brand new passphrase"}}})
	expectStatus(t, "", 410, []routeCase{{"POST", "/api/auth/reset-password", map[string]any{"token": token, "password": "another new passphrase"}}})

	expectTokenStatus(t, first, 401, "GET", "/api/me") // every session was signed out
	expectStatus(t, "", 401, []routeCase{{"POST", "/api/auth/login", map[string]any{"identifier": "rani@example.com", "password": strongPassword}}})
	expectStatus(t, "", 200, []routeCase{{"POST", "/api/auth/login", map[string]any{"identifier": "rani@example.com", "password": "a brand new passphrase"}}})
}

func TestSquattedEmailIsReclaimedClean(t *testing.T) {
	resetDB(t)
	// An attacker signs up with the victim's address. The account stays pending: it cannot sign in,
	// so it cannot create trees or anything else a victim could later inherit.
	call(t, "", "POST", "/api/auth/signup", map[string]any{"name": "Squatter", "email": "victim@example.com", "password": strongPassword})
	expectStatus(t, "", 403, []routeCase{{"POST", "/api/auth/login", map[string]any{"identifier": "victim@example.com", "password": strongPassword}}})

	// The victim clicking the unexpected verification email does not help the attacker: it needs the password.
	squatToken := testMail.waitToken(t, "victim@example.com", "/auth/verify-email", 1)
	expectStatus(t, "", 403, []routeCase{{"POST", "/api/auth/verify-email", map[string]any{"token": squatToken}}})

	// The victim reclaims the address with a password reset: their password, verified, no leftovers.
	call(t, "", "POST", "/api/auth/forgot-password", map[string]any{"email": "victim@example.com"})
	reset := testMail.waitToken(t, "victim@example.com", "/auth/reset-password", 1)
	expectStatus(t, "", 200, []routeCase{{"POST", "/api/auth/reset-password", map[string]any{"token": reset, "password": "the victims own phrase"}}})
	expectStatus(t, "", 401, []routeCase{{"POST", "/api/auth/login", map[string]any{"identifier": "victim@example.com", "password": strongPassword}}})
	login := call(t, "", "POST", "/api/auth/login", map[string]any{"identifier": "victim@example.com", "password": "the victims own phrase"})
	if login.Status != 200 {
		t.Fatalf("victim login: %d %v", login.Status, login.Body)
	}
	if trees := callToken(t, str(dataMap(login), "accessToken"), "GET", "/api/trees", nil).list(); len(trees) != 0 {
		t.Errorf("reclaimed account has trees: %v", trees)
	}
	// The squatter's old verification link is dead after the reset.
	expectStatus(t, "", 410, []routeCase{{"POST", "/api/auth/verify-email", map[string]any{"token": squatToken, "password": strongPassword}}})
}

func TestEmailChangeNeedsVerificationByRequester(t *testing.T) {
	resetDB(t)
	// Review finding: a Google account pointing its email at a victim's address. The change stays pending
	// (the account email does not move), and the link only works for the signed-in requester.
	attacker, _ := googleSignIn(context.Background(), "g-attacker", "attacker@gmail.com", "Attacker")
	attackerToken := tokenFor(t, attacker.ID)
	got := callToken(t, attackerToken, "PUT", "/api/me/email", map[string]any{"email": "victim@example.com"})
	if got.Status != 200 || dataMap(got)["pendingEmail"] != "victim@example.com" {
		t.Fatalf("email change request: %d %v", got.Status, got.Body)
	}
	var email string
	DB.Table("users").Select("email").Where("id = ?", attacker.ID).Scan(&email)
	if email != "attacker@gmail.com" {
		t.Fatalf("account email changed before verification: %s", email)
	}
	link := testMail.waitToken(t, "victim@example.com", "/auth/verify-email", 1)
	// The victim opening it (not signed in as the attacker) achieves nothing and keeps the address free.
	expectStatus(t, "", 401, []routeCase{{"POST", "/api/auth/verify-email", map[string]any{"token": link}}})
	signupVerified(t, "Victim", "victim@example.com")
	// Even the attacker with the link could not take the address now.
	if res := callToken(t, attackerToken, "POST", "/api/auth/verify-email", map[string]any{"token": link}); res.Status != 409 {
		t.Errorf("verifying a taken address: got %d, want 409", res.Status)
	}

	// The legitimate flow: a family account adds an email and confirms it while signed in.
	hash, _ := hashPassword("legacy-pass-123")
	DB.Exec("UPDATE users SET password = ? WHERE id = ?", hash, bob)
	bobToken := tokenFor(t, bob)
	if res := callToken(t, bobToken, "PUT", "/api/me/email", map[string]any{"email": "bob@example.com", "password": "wrong"}); res.Status != 403 {
		t.Errorf("email change without password: got %d", res.Status)
	}
	callToken(t, bobToken, "PUT", "/api/me/email", map[string]any{"email": "Bob@Example.com", "password": "legacy-pass-123"})
	bobLink := testMail.waitToken(t, "bob@example.com", "/auth/verify-email", 1)
	if res := callToken(t, bobToken, "POST", "/api/auth/verify-email", map[string]any{"token": bobLink}); res.Status != 200 {
		t.Fatalf("confirm email change: %d %v", res.Status, res.Body)
	}
	if u, _ := dataMap(callToken(t, bobToken, "GET", "/api/me", nil))["user"].(map[string]any); u["email"] != "bob@example.com" || u["emailVerified"] != true {
		t.Errorf("email after change: %v", u)
	}
}

func TestChangePasswordAndSessions(t *testing.T) {
	resetDB(t)
	hash, _ := hashPassword("legacy-pass-123")
	DB.Exec("UPDATE users SET password = ?, email = 'bob@example.com', email_verified_at = now() WHERE id = ?", hash, bob)
	a := str(dataMap(call(t, "", "POST", "/api/auth/signin", map[string]any{"username": bob, "password": "legacy-pass-123"})), "token")
	b := str(dataMap(call(t, "", "POST", "/api/auth/signin", map[string]any{"username": bob, "password": "legacy-pass-123"})), "token")
	call(t, "", "POST", "/api/auth/forgot-password", map[string]any{"email": "bob@example.com"})
	pendingReset := testMail.waitToken(t, "bob@example.com", "/auth/reset-password", 1)

	if got := callToken(t, a, "GET", "/api/auth/sessions", nil).list(); len(got) != 2 {
		t.Fatalf("sessions = %d, want 2", len(got))
	}
	if got := callToken(t, a, "POST", "/api/auth/change-password", map[string]any{"currentPassword": "nope", "newPassword": "a whole new phrase"}); got.Status != 403 {
		t.Errorf("wrong current password: got %d", got.Status)
	}
	if got := callToken(t, a, "POST", "/api/auth/change-password", map[string]any{"currentPassword": "legacy-pass-123", "newPassword": "a whole new phrase"}); got.Status != 200 {
		t.Fatalf("change password: %d %v", got.Status, got.Body)
	}
	expectTokenStatus(t, a, 200, "GET", "/api/me") // the current session stays
	expectTokenStatus(t, b, 401, "GET", "/api/me") // others are signed out
	// A reset link requested before the change no longer works.
	expectStatus(t, "", 410, []routeCase{{"POST", "/api/auth/reset-password", map[string]any{"token": pendingReset, "password": "sneaky new phrase"}}})

	sessions := callToken(t, a, "GET", "/api/auth/sessions", nil).list()
	current := sessions[0].(map[string]any)
	expectTokenStatus(t, a, 200, "DELETE", "/api/auth/sessions/"+str(current, "_id"))
	expectTokenStatus(t, a, 401, "GET", "/api/me")
}

func TestGoogleSignInLinking(t *testing.T) {
	resetDB(t)
	ctx := context.Background()

	// New identity: a verified account without a password.
	u, err := googleSignIn(ctx, "g-1", "New.Person@Gmail.com", "New Person")
	if err != nil || u.Email != "new.person@gmail.com" || !u.EmailVerified || u.HasPassword || !u.GoogleLinked {
		t.Fatalf("new google user: %+v %v", u, err)
	}
	again, _ := googleSignIn(ctx, "g-1", "new.person@gmail.com", "")
	if again.ID != u.ID {
		t.Error("same Google subject must map to the same account")
	}
	// Another Google identity claiming the same verified address is refused, never re-linked.
	if _, err := googleSignIn(ctx, "g-9", "new.person@gmail.com", ""); err != errGoogleConflict {
		t.Errorf("re-link to another identity: %v", err)
	}

	// A pending signup for the address is taken over cleanly by the Google owner.
	call(t, "", "POST", "/api/auth/signup", map[string]any{"name": "Squatter", "email": "victim@example.com", "password": strongPassword})
	victim, err := googleSignIn(ctx, "g-2", "victim@example.com", "Victim")
	if err != nil || victim.HasPassword || !victim.EmailVerified {
		t.Fatalf("take over pending signup: %+v %v", victim, err)
	}
	expectStatus(t, "", 401, []routeCase{{"POST", "/api/auth/login", map[string]any{"identifier": "victim@example.com", "password": strongPassword}}})

	// A verified password account keeps its password when Google is linked.
	DB.Exec("UPDATE users SET email = 'carol@example.com', email_verified_at = now(), password = 'hash' WHERE id = ?", carol)
	linked, _ := googleSignIn(ctx, "g-3", "carol@example.com", "")
	if linked.ID != carol || !linked.HasPassword {
		t.Errorf("verified account link: %+v", linked)
	}

	// The one-time code only works with the binding of the browser that started the sign-in, and once.
	code, _ := issueBoundAuthToken(ctx, u.ID, "oauth_login", "", hashInviteToken("browser-binding-value-123"), oauthCodeTTL)
	expectStatus(t, "", 410, []routeCase{{"POST", "/api/auth/google/exchange", map[string]any{"code": code, "binding": "someone-elses-browser-xyz"}}})
	res := call(t, "", "POST", "/api/auth/google/exchange", map[string]any{"code": code, "binding": "browser-binding-value-123"})
	if res.Status != 200 || str(dataMap(res), "refreshToken") == "" {
		t.Fatalf("exchange: %d %v", res.Status, res.Body)
	}
	expectStatus(t, "", 410, []routeCase{{"POST", "/api/auth/google/exchange", map[string]any{"code": code, "binding": "browser-binding-value-123"}}})

	for _, bad := range []string{"//evil.example", "https://evil.example", "/\t/evil.example", "/\\evil.example", "/ /x"} {
		if safeNext(bad) != "/" {
			t.Errorf("safeNext(%q) allowed", bad)
		}
	}
	if safeNext("/trees/1?focus=2") != "/trees/1?focus=2" {
		t.Error("safeNext rejected a normal path")
	}
}

func TestAccountDeletionAndExport(t *testing.T) {
	resetDB(t)
	// alice solely owns tree A, which other people use: deletion is blocked until she hands it over.
	if got := call(t, alice, "DELETE", "/api/me", map[string]any{"confirm": "DELETE"}); got.Status != 409 {
		t.Fatalf("delete with shared sole-owned tree: %d %v", got.Status, got.Body)
	}
	expectStatus(t, alice, 400, []routeCase{{"DELETE", "/api/me", map[string]any{}}})

	// Exports: owners get the whole tree, others are refused.
	export := dataMap(call(t, alice, "GET", "/api/trees/"+treeA+"/export", nil))
	if people, _ := export["people"].([]any); len(people) != 2 {
		t.Errorf("export people = %v", export["people"])
	}
	expectStatus(t, bob, 403, []routeCase{{"GET", "/api/trees/" + treeA + "/export", nil}})
	expectStatus(t, bob, 200, []routeCase{{"GET", "/api/me/export", nil}})

	// A private tree is deleted with its owner; a password is required for password accounts.
	solo := str(signupVerified(t, "Solo", "solo@example.com"), "accessToken")
	tree := dataMap(callToken(t, solo, "POST", "/api/trees", map[string]any{"name": "Solo tree"}))
	callToken(t, solo, "POST", "/api/trees/"+str(tree, "_id")+"/people", form{"name": "P", "nickname": "p", "address": "x", "status": "alive", "gender": "male"})
	if got := callToken(t, solo, "DELETE", "/api/me", map[string]any{"confirm": "DELETE", "password": "wrong"}); got.Status != 403 {
		t.Errorf("delete with wrong password: %d", got.Status)
	}
	if got := callToken(t, solo, "DELETE", "/api/me", map[string]any{"confirm": "DELETE", "password": strongPassword}); got.Status != 200 {
		t.Fatalf("delete account: %d %v", got.Status, got.Body)
	}
	var users, trees, people int64
	DB.Table("users").Where("lower(email) = 'solo@example.com'").Count(&users)
	DB.Table("trees").Where("id = ?", str(tree, "_id")).Count(&trees)
	DB.Table("people").Where("tree_id = ?", str(tree, "_id")).Count(&people)
	if users+trees+people != 0 {
		t.Errorf("leftovers after deletion: users=%d trees=%d people=%d", users, trees, people)
	}
	expectTokenStatus(t, solo, 401, "GET", "/api/me")
}

func TestProductionConfigCheck(t *testing.T) {
	for _, k := range []string{"JWT_SECRET", "REDIS_URL", "RESEND_API_KEY", "TRUSTED_PROXIES", "CLIENT_IP_HEADER", "APP_BASE_URL", "API_BASE_URL", "ALLOWED_ORIGINS", "BFF_SHARED_SECRET"} {
		t.Setenv(k, "")
	}
	if err := CheckProductionConfig(); err == nil || !strings.Contains(err.Error(), "REDIS_URL") || !strings.Contains(err.Error(), "ALLOWED_ORIGINS") {
		t.Errorf("empty production config accepted: %v", err)
	}
	t.Setenv("JWT_SECRET", strings.Repeat("s", 40))
	t.Setenv("REDIS_URL", "redis://r")
	t.Setenv("RESEND_API_KEY", "re_x")
	t.Setenv("TRUSTED_PROXIES", "none")
	t.Setenv("BFF_SHARED_SECRET", strings.Repeat("b", 40))
	t.Setenv("APP_BASE_URL", "https://app.example")
	t.Setenv("API_BASE_URL", "https://api.example")
	t.Setenv("ALLOWED_ORIGINS", "https://app.example/path")
	if err := CheckProductionConfig(); err == nil || !strings.Contains(err.Error(), "ALLOWED_ORIGINS") {
		t.Errorf("origin with a path accepted: %v", err)
	}
	t.Setenv("ALLOWED_ORIGINS", "https://app.example, https://www.app.example")
	if err := CheckProductionConfig(); err != nil {
		t.Errorf("complete production config rejected: %v", err)
	}
}

func TestBFFClientIP(t *testing.T) {
	t.Setenv("BFF_SHARED_SECRET", "bff-secret-for-tests-0123456789abcdef")
	r := gin.New()
	r.Use(BFFClientIPMiddleware())
	r.GET("/ip", func(c *gin.Context) { c.String(200, clientIP(c)) })
	ip := func(headers map[string]string) string {
		req := httptest.NewRequest("GET", "/ip", nil)
		req.RemoteAddr = "10.1.2.3:5555"
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Body.String()
	}
	if got := ip(map[string]string{"X-BFF-Secret": "bff-secret-for-tests-0123456789abcdef", "X-Client-IP": "203.0.113.9"}); got != "203.0.113.9" {
		t.Errorf("verified BFF client IP = %s", got)
	}
	if got := ip(map[string]string{"X-BFF-Secret": "wrong", "X-Client-IP": "203.0.113.9"}); got == "203.0.113.9" {
		t.Error("client IP accepted with a wrong secret")
	}
	if got := ip(map[string]string{"X-Client-IP": "203.0.113.9"}); got == "203.0.113.9" {
		t.Error("client IP accepted without the secret")
	}
	if got := ip(map[string]string{"X-BFF-Secret": "bff-secret-for-tests-0123456789abcdef", "X-Client-IP": "not-an-ip"}); got == "not-an-ip" {
		t.Error("invalid client IP accepted")
	}
}
