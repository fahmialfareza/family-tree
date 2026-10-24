package app

import (
	"errors"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/newrelic/go-agent/v3/newrelic"
	"golang.org/x/crypto/bcrypt"
)

// jwtSecret is set by InitAuth. It must not be read at package init: that runs before main loads .env,
// which previously made local runs fall back to a hardcoded, public secret.
var jwtSecret []byte

// InitAuth loads JWT_SECRET; call it after the environment (including .env) is loaded.
func InitAuth() error {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		return errors.New("JWT_SECRET is required")
	}
	jwtSecret = []byte(s)
	return nil
}

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

	user, err := findUserByUsername(c, body.Username)
	if err != nil {
		responseError(c, "Invalid username or password", 401)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(body.Password)); err != nil {
		responseError(c, "Invalid username or password", 401)
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":  user.ID,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	})
	s, err := token.SignedString(jwtSecret)
	if err != nil {
		responseError(c, "Failed to sign token", 500)
		return
	}

	c.Set("user", user)
	c.Set("token", s)
	profile(c)
}

func authenticate(roles []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		txn := newrelic.FromContext(c.Request.Context())
		defer txn.StartSegment("middleware/authenticate").End()

		auth := c.GetHeader("Authorization")
		if auth == "" {
			responseError(c, "No token provided", 401)
			c.Abort()
			return
		}
		parts := strings.SplitN(auth, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			responseError(c, "No token provided", 401)
			c.Abort()
			return
		}
		tokenStr := parts[1]

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) { return jwtSecret, nil },
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
		if err != nil || !token.Valid {
			responseError(c, "Invalid token", 401)
			c.Abort()
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["id"] == nil {
			responseError(c, "Invalid token", 401)
			c.Abort()
			return
		}
		var id string
		switch v := claims["id"].(type) {
		case string:
			id = v
		case interface{}:
			id = ""
			if s, ok := v.(string); ok {
				id = s
			}
		default:
			id = ""
		}
		if id == "" {
			responseError(c, "Invalid token", 401)
			c.Abort()
			return
		}
		user, err := findUserById(c, id)
		if err != nil {
			txn.NoticeError(err)
			responseError(c, "User not found", 401)
			c.Abort()
			return
		}

		// if roles is empty or nil, any authenticated user is allowed
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
		c.Next()
	}
}

func createUser(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/createUser").End()
	var body struct {
		Name     string `json:"name"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	hashed, _ := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	u := &User{ID: "", Name: body.Name, Username: body.Username, Password: string(hashed), Role: RoleUser}

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
	if err != nil {
		responseError(c, "Failed to create user", 500)
		return
	}
	newUser.Password = ""
	responseSuccess(c, newUser, 201)
}

func profile(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/profile").End()
	u, _ := c.Get("user")
	t, _ := c.Get("token")
	user := u.(*User)
	userCopy := *user
	userCopy.Password = ""
	responseSuccess(c, gin.H{"user": userCopy, "token": t}, 200)
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
