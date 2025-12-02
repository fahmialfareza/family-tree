package app

import (
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"golang.org/x/crypto/bcrypt"
)

func getJWTSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "family-tree-secret"
	}
	return []byte(s)
}

func signIn(c *gin.Context) {
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
	s, err := token.SignedString(getJWTSecret())
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

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) { return getJWTSecret(), nil })
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
			// try to stringify
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

		c.Set("user", user)
		c.Next()
	}
}

func createUser(c *gin.Context) {
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
	newUser, err := addUser(c, u)
	if err != nil {
		responseError(c, "Failed to create user", 500)
		return
	}
	newUser.Password = ""
	responseSuccess(c, newUser, 201)
}

func profile(c *gin.Context) {
	u, _ := c.Get("user")
	t, _ := c.Get("token")
	user := u.(*User)
	userCopy := *user
	userCopy.Password = ""
	responseSuccess(c, gin.H{"user": userCopy, "token": t}, 200)
}

func users(c *gin.Context) {
	// only admin allowed by middleware
	us, err := repoFindUsers(c, bson.M{"role": RoleUser})
	if err != nil {
		responseError(c, "Failed to fetch users", 500)
		return
	}
	responseSuccess(c, us, 200)
}
