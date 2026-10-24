package app

import (
	"errors"
	"net/mail"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
)

// jwtSecret is set by InitAuth. It must not be read at package init: that runs before main loads .env,
// which previously made local runs fall back to a hardcoded, public secret.
var jwtSecret []byte

const (
	verifyEmailTTL   = 24 * time.Hour
	resetPasswordTTL = time.Hour
	maxNameLength    = 120
)

// InitAuth loads JWT_SECRET; call it after the environment (including .env) is loaded.
func InitAuth() error {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		return errors.New("JWT_SECRET is required")
	}
	jwtSecret = []byte(s)
	return nil
}

func bearerToken(c *gin.Context) string {
	parts := strings.SplitN(c.GetHeader("Authorization"), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// authenticate requires a valid access token whose session is still live. roles, when given,
// restricts the platform role (admin/user); tree permissions are checked separately by withTree.
func authenticate(roles []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		txn := newrelic.FromContext(c.Request.Context())
		defer txn.StartSegment("middleware/authenticate").End()

		tokenStr := bearerToken(c)
		if tokenStr == "" {
			responseError(c, "No token provided", 401)
			c.Abort()
			return
		}
		userID, sessionID, err := parseAccessToken(tokenStr)
		if err != nil {
			responseError(c, "Invalid token", 401)
			c.Abort()
			return
		}
		user, err := sessionUser(c, sessionID, userID)
		if err != nil {
			responseError(c, "Session expired, please sign in again", 401)
			c.Abort()
			return
		}
		if len(roles) > 0 {
			allowed := false
			for _, r := range roles {
				if string(user.Role) == r {
					allowed = true
					break
				}
			}
			if !allowed {
				responseError(c, "Forbidden", 403)
				c.Abort()
				return
			}
		}

		txn.AddAttribute("user.id", user.ID)
		txn.AddAttribute("user.role", string(user.Role))
		c.Set("user", user)
		c.Set("sessionID", sessionID)
		c.Next()
	}
}

func currentSessionID(c *gin.Context) string { return c.GetString("sessionID") }

// verifyCredentials checks an email-or-username and password, with per-identifier and per-account
// throttling on top of the per-IP limit on the route. It writes the error response and returns nil on
// failure. Unknown accounts, wrong passwords and password-less accounts all cost the same bcrypt time.
func verifyCredentials(c *gin.Context, identifier, password string) *User {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" || password == "" {
		responseError(c, "Missing email/username or password", 400)
		return nil
	}
	if !limitByKey(c, "login:"+strings.ToLower(identifier), 10, 15*time.Minute) {
		return nil
	}
	user, err := findUserByLogin(c, identifier)
	hash := ""
	if err == nil {
		// Email and username share one counter per account.
		if !limitByKey(c, "login-user:"+user.ID, 10, 15*time.Minute) {
			return nil
		}
		hash = user.Password
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		abortServerError(c, err)
		return nil
	}
	if !checkPassword(hash, password) {
		responseError(c, "Invalid email/username or password", 401)
		return nil
	}
	if user.Pending {
		responseError(c, "Please verify your email first. Check your inbox for the link.", 403)
		return nil
	}
	if needsRehash(hash) {
		if newHash, err := hashPassword(password); err == nil {
			_ = setUserPassword(DB.WithContext(c), user.ID, newHash)
		}
	}
	return user
}

// signIn is the legacy login used by the current frontend: {username, password} -> {user, token}.
// The token is a 24h access token backed by a session (no refresh token).
func signIn(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/signIn").End()
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Missing username or password", 400)
		return
	}
	user := verifyCredentials(c, body.Username, body.Password)
	if user == nil {
		return
	}
	pair, err := createSession(c, user, c.Request.UserAgent(), c.ClientIP(), false)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, gin.H{"user": pair.User, "token": pair.AccessToken}, 200)
}

// login is the current API: {identifier (email or username), password} -> access + refresh tokens.
func login(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/login").End()
	var body struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	user := verifyCredentials(c, body.Identifier, body.Password)
	if user == nil {
		return
	}
	pair, err := createSession(c, user, c.Request.UserAgent(), c.ClientIP(), true)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, pair, 200)
}

func validName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	return name, name != "" && len([]rune(name)) <= maxNameLength
}

func validEmail(email string) (string, bool) {
	addr, err := mail.ParseAddress(strings.TrimSpace(email))
	if err != nil || len(addr.Address) > 254 || addr.Address != strings.TrimSpace(email) {
		return "", false
	}
	return normalizeEmail(addr.Address), true
}

// signup creates a pending account and emails a verification link. The account cannot sign in until the
// link is opened (with the signup password), so nobody can occupy someone else's address: an unfinished
// signup holds no data, and the address owner can always take it over with a password reset or Google.
func signup(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/signup").End()
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	name, ok := validName(body.Name)
	if !ok {
		responseError(c, "Name is required (max 120 characters)", 400)
		return
	}
	email, ok := validEmail(body.Email)
	if !ok {
		responseError(c, "A valid email is required", 400)
		return
	}
	if msg := validatePassword(body.Password, email, name); msg != "" {
		responseError(c, msg, 400)
		return
	}
	if !limitByKey(c, "signup:"+email, 3, time.Hour) {
		return
	}
	hash, err := hashPassword(body.Password)
	if err != nil {
		abortServerError(c, err)
		return
	}
	user, err := addUser(c, &User{Name: name, Email: email, Password: hash, Role: RoleUser}, "", "")
	if errors.Is(err, errEmailTaken) {
		responseError(c, "An account with this email already exists. Sign in, or reset your password.", 409)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	token, err := issueAuthToken(c, user.ID, "verify_email", email, verifyEmailTTL)
	if err != nil {
		abortServerError(c, err)
		return
	}
	sendVerificationEmail(email, token)
	responseSuccess(c, gin.H{"user": user, "verificationRequired": true}, 201)
}

func refreshTokens(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/refreshTokens").End()
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.RefreshToken == "" {
		responseError(c, "Invalid request body", 400)
		return
	}
	pair, err := rotateRefreshToken(c, body.RefreshToken, c.Request.UserAgent(), c.ClientIP())
	if errors.Is(err, errSessionInvalid) {
		responseError(c, "Session expired, please sign in again", 401)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, pair, 200)
}

func logout(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/logout").End()
	if err := revokeSession(c, currentUser(c).ID, currentSessionID(c)); err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

// logoutEverywhere revokes every session of the user, including the current one.
func logoutEverywhere(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/logoutEverywhere").End()
	if err := revokeSessionsTx(DB.WithContext(c), currentUser(c).ID, ""); err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

func getSessions(c *gin.Context) {
	sessions, err := listSessions(c, currentUser(c).ID, currentSessionID(c))
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, sessions, 200)
}

func deleteSession(c *gin.Context) {
	err := revokeSession(c, currentUser(c).ID, c.Param("sessionId"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		responseError(c, "Session not found", 404)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

// verifyEmail opens an emailed link. For a pending signup it also needs the signup password, so clicking an
// unexpected link cannot activate an account someone else created with your address; it then signs in.
// For an email change the caller must be signed in to the account that asked for it, so a link that an
// attacker's account sent to your inbox is useless to them; the new address only becomes the account
// email at this point.
func verifyEmail(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/verifyEmail").End()
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
		responseError(c, "Invalid request body", 400)
		return
	}
	var activated *User
	err := DB.WithContext(c).Transaction(func(tx *gorm.DB) error {
		tok, err := consumeAuthToken(tx, body.Token, "verify_email")
		if err != nil {
			return err
		}
		user, err := loadLiveUser(tx, tok.UserID)
		if err != nil {
			return errTokenInvalid
		}
		email := normalizeEmail(deref(tok.Email))
		if !user.Pending {
			if signedIn := optionalUser(c); signedIn == nil || signedIn.ID != user.ID {
				return errNotRequester // rolls back: the link stays usable for its owner
			}
		}
		if user.Pending {
			if email != normalizeEmail(user.Email) {
				return errTokenInvalid
			}
			if !checkPassword(user.Password, body.Password) {
				return errWrongPassword // rolls back: the link stays usable
			}
			activated = user
		}
		if err := applyVerifiedEmail(tx, user.ID, email); err != nil {
			return err
		}
		// Reset links sent to an old address must not outlive the change.
		return invalidateAuthTokens(tx, user.ID, "reset_password")
	})
	switch {
	case errors.Is(err, errTokenInvalid):
		responseError(c, "This link is invalid or has expired", 410)
		return
	case errors.Is(err, errWrongPassword):
		responseError(c, "Enter the password you signed up with to confirm this email", 403)
		return
	case errors.Is(err, errNotRequester):
		responseError(c, "Sign in to the account that asked for this email change, then open the link again", 401)
		return
	case errors.Is(err, errEmailTaken):
		responseError(c, "Another account already uses this email", 409)
		return
	case err != nil:
		abortServerError(c, err)
		return
	}
	if activated == nil {
		responseSuccess(c, gin.H{"verified": true}, 200)
		return
	}
	activated.EmailVerified, activated.Pending = true, false
	pair, err := createSession(c, activated, c.Request.UserAgent(), c.ClientIP(), true)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, gin.H{"verified": true, "session": pair}, 200)
}

var (
	errWrongPassword = errors.New("wrong password")
	errNotRequester  = errors.New("not signed in as the account that requested this")
)

// optionalUser returns the signed-in user for routes that also work anonymously, or nil.
func optionalUser(c *gin.Context) *User {
	userID, sessionID, err := parseAccessToken(bearerToken(c))
	if err != nil {
		return nil
	}
	user, err := sessionUser(c, sessionID, userID)
	if err != nil {
		return nil
	}
	return user
}

// resendVerification re-sends the signup link for a pending account. Always 200 (no account discovery).
func resendVerification(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/resendVerification").End()
	var body struct {
		Email string `json:"email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	email, ok := validEmail(body.Email)
	if !ok {
		responseError(c, "A valid email is required", 400)
		return
	}
	if !limitByKey(c, "verify:"+email, 3, time.Hour) {
		return
	}
	if row, err := findUserByEmail(c, email); err == nil && row.toModel().Pending {
		if token, err := issueAuthToken(c, row.ID, "verify_email", email, verifyEmailTTL); err == nil {
			sendVerificationEmail(email, token)
		}
	}
	responseSuccess(c, gin.H{"message": "If a signup is waiting for this email, a new link is on its way."}, 200)
}

// forgotPassword always answers 200 so it cannot be used to find out which emails have accounts.
func forgotPassword(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/forgotPassword").End()
	var body struct {
		Email string `json:"email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	email, ok := validEmail(body.Email)
	if !ok {
		responseError(c, "A valid email is required", 400)
		return
	}
	if !limitByKey(c, "forgot:"+email, 3, time.Hour) {
		return
	}
	if row, err := findUserByEmail(c, email); err == nil {
		if token, err := issueAuthToken(c, row.ID, "reset_password", email, resetPasswordTTL); err == nil {
			sendPasswordResetEmail(email, token)
		}
	}
	responseSuccess(c, gin.H{"message": "If an account exists for this email, a reset link is on its way."}, 200)
}

// resetPassword sets a new password from an emailed link and signs out every session. Following the link
// proves control of the inbox, so it also completes a pending signup for that address.
func resetPassword(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/resetPassword").End()
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
		responseError(c, "Invalid request body", 400)
		return
	}
	var badPassword string
	err := DB.WithContext(c).Transaction(func(tx *gorm.DB) error {
		tok, err := consumeAuthToken(tx, body.Token, "reset_password")
		if err != nil {
			return err
		}
		user, err := loadLiveUser(tx, tok.UserID)
		if err != nil || normalizeEmail(user.Email) != normalizeEmail(deref(tok.Email)) {
			return errTokenInvalid // the account's email changed since the link was sent
		}
		if badPassword = validatePassword(body.Password, user.Email, user.Username, user.Name); badPassword != "" {
			return errWeakPassword
		}
		hash, err := hashPassword(body.Password)
		if err != nil {
			return err
		}
		if err := setUserPassword(tx, user.ID, hash); err != nil {
			return err
		}
		if user.Pending {
			if err := applyVerifiedEmail(tx, user.ID, user.Email); err != nil {
				return err
			}
		}
		if err := invalidateAuthTokens(tx, user.ID, "verify_email"); err != nil {
			return err
		}
		return revokeSessionsTx(tx, user.ID, "")
	})
	switch {
	case errors.Is(err, errTokenInvalid):
		responseError(c, "This link is invalid or has expired", 410)
	case errors.Is(err, errWeakPassword):
		responseError(c, badPassword, 400) // the token was not consumed: the transaction rolled back
	case err != nil:
		abortServerError(c, err)
	default:
		responseSuccess(c, true, 200)
	}
}

var errWeakPassword = errors.New("weak password")

// changePassword requires the current password (if one is set) and signs out all other sessions.
func changePassword(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/changePassword").End()
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	user := currentUser(c)
	if !reauthenticate(c, user, body.CurrentPassword) {
		return
	}
	if msg := validatePassword(body.NewPassword, user.Email, user.Username, user.Name); msg != "" {
		responseError(c, msg, 400)
		return
	}
	hash, err := hashPassword(body.NewPassword)
	if err != nil {
		abortServerError(c, err)
		return
	}
	err = DB.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := setUserPassword(tx, user.ID, hash); err != nil {
			return err
		}
		if err := invalidateAuthTokens(tx, user.ID, "reset_password"); err != nil {
			return err
		}
		return revokeSessionsTx(tx, user.ID, currentSessionID(c))
	})
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// createUser is the legacy admin flow for adding family accounts by username.
func createUser(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/createUser").End()
	var body struct {
		Name     string `json:"name"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Username) == "" {
		responseError(c, "Invalid request body", 400)
		return
	}
	if strings.Contains(body.Username, "@") {
		responseError(c, "Usernames cannot contain @", 400)
		return
	}
	if msg := validatePassword(body.Password, body.Username, body.Name); msg != "" {
		responseError(c, msg, 400)
		return
	}
	hashed, err := hashPassword(body.Password)
	if err != nil {
		abortServerError(c, err)
		return
	}
	u := &User{Name: body.Name, Username: strings.TrimSpace(body.Username), Password: hashed, Role: RoleUser}

	// Users created by an admin join the admin's tree as editors (limited to the branches shared with them),
	// but only when the admin owns that tree; otherwise they start without a tree.
	admin := currentUser(c)
	treeID, err := defaultTreeIDForUser(c, admin.ID)
	if err != nil && !errors.Is(err, errNoTree) {
		responseError(c, "Failed to create user", 500)
		return
	}
	if treeID != "" {
		access, err := loadTreeAccess(c, treeID, admin.ID)
		if err != nil {
			responseError(c, "Failed to create user", 500)
			return
		}
		if access == nil || access.Role != TreeRoleOwner {
			treeID = ""
		}
	}
	newUser, err := addUser(c, u, treeID, TreeRoleEditor)
	if errors.Is(err, errUsernameTaken) {
		responseError(c, "This username is already taken", 409)
		return
	}
	if err != nil {
		responseError(c, "Failed to create user", 500)
		return
	}
	responseSuccess(c, newUser, 201)
}

// profile is the legacy "who am I" endpoint: {user, token}.
func profile(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/profile").End()
	responseSuccess(c, gin.H{"user": currentUser(c), "token": bearerToken(c)}, 200)
}

// users is the legacy owner picker: the other members of the caller's tree, in the old User shape.
func users(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/users").End()
	access := currentAccess(c)
	members, err := listMembersRepo(c, access.TreeID)
	if err != nil {
		responseError(c, "Failed to fetch users", 500)
		return
	}
	us := make([]User, 0, len(members))
	for _, m := range members {
		if m.UserID == access.UserID {
			continue
		}
		us = append(us, User{ID: m.UserID, Name: m.Name, Username: m.Username, Role: RoleUser})
	}
	responseSuccess(c, us, 200)
}
