package app

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

func getMe(c *gin.Context) {
	user := currentUser(c)
	trees, err := listTreesForUser(c, user.ID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, gin.H{"user": user, "trees": trees}, 200)
}

// updateMe changes the profile: {name?, locale?} (locale "en" or "id").
func updateMe(c *gin.Context) {
	var body struct {
		Name   *string `json:"name"`
		Locale *string `json:"locale"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || (body.Name == nil && body.Locale == nil) {
		responseError(c, "Invalid request body", 400)
		return
	}
	updates := map[string]any{}
	if body.Name != nil {
		name, ok := validName(*body.Name)
		if !ok {
			responseError(c, "Name is required (max 120 characters)", 400)
			return
		}
		updates["name"] = name
	}
	if body.Locale != nil {
		if *body.Locale != "en" && *body.Locale != "id" {
			responseError(c, `Locale must be "en" or "id"`, 400)
			return
		}
		updates["locale"] = *body.Locale
	}
	user := currentUser(c)
	if err := updateUserProfile(c, user.ID, updates); err != nil {
		abortServerError(c, err)
		return
	}
	if v, ok := updates["name"].(string); ok {
		user.Name = v
	}
	if body.Locale != nil {
		user.Locale = *body.Locale
	}
	responseSuccess(c, user, 200)
}

// reauthenticate checks the password of accounts that have one before sensitive changes.
// Accounts without a password (Google-only) rely on their live session.
func reauthenticate(c *gin.Context, user *User, password string) bool {
	if !user.HasPassword {
		return true
	}
	if !limitByKey(c, "password:"+user.ID, 10, 15*time.Minute) {
		return false
	}
	if !checkPassword(user.Password, password) {
		responseError(c, "Password is incorrect", 403)
		return false
	}
	return true
}

// changeEmail emails a link to the new address. The account keeps its current email until that link is
// opened, so an account can never hold an address its owner has not proven (existing family accounts
// start without one).
func changeEmail(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/changeEmail").End()
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
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
	user := currentUser(c)
	if !reauthenticate(c, user, body.Password) {
		return
	}
	if email == normalizeEmail(user.Email) {
		responseSuccess(c, gin.H{"pendingEmail": nil}, 200)
		return
	}
	if !limitByKey(c, "email-change:"+user.ID, 5, time.Hour) {
		return
	}
	if taken, err := emailInUse(c, email, user.ID); err != nil {
		abortServerError(c, err)
		return
	} else if taken {
		responseError(c, "Another account already uses this email", 409)
		return
	}
	token, err := issueAuthToken(c, user.ID, "verify_email", email, verifyEmailTTL)
	if err != nil {
		abortServerError(c, err)
		return
	}
	sendVerificationEmail(email, token)
	responseSuccess(c, gin.H{"pendingEmail": email}, 200)
}

// deleteMe permanently deletes the account. Trees the user alone owns but shares with others must
// get another owner first; trees nobody else belongs to are deleted with the account.
func deleteMe(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/deleteMe").End()
	var body struct {
		Password string `json:"password"`
		Confirm  string `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Confirm != "DELETE" {
		responseError(c, `Send {"confirm":"DELETE"} (and your password) to delete your account`, 400)
		return
	}
	user := currentUser(c)
	if !reauthenticate(c, user, body.Password) {
		return
	}
	err := deleteAccount(c, user.ID)
	if errors.Is(err, errSoleOwner) {
		shared, _, _ := soleOwnedTrees(DB.WithContext(c), user.ID)
		c.JSON(409, gin.H{"status": 409, "message": "Make someone else an owner of these trees first", "trees": shared})
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

// exportMe returns the account's own data (privacy-law data access request).
func exportMe(c *gin.Context) {
	user := currentUser(c)
	trees, err := listTreesForUser(c, user.ID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	sessions, err := listSessions(c, user.ID, currentSessionID(c))
	if err != nil {
		abortServerError(c, err)
		return
	}
	c.Header("Content-Disposition", `attachment; filename="family-tree-account.json"`)
	responseSuccess(c, gin.H{"exportedAt": time.Now(), "user": user, "trees": trees, "sessions": sessions}, 200)
}

// exportTree returns every person, family, relationship and member of a tree as JSON (owners only).
func exportTree(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/exportTree").End()
	access := currentAccess(c)
	tree, err := getTreeRepo(c, access.TreeID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	people, err := repoGetAllPeople(c, access.TreeID, nil)
	if err != nil {
		abortServerError(c, err)
		return
	}
	families, err := getAllFamiliesRepo(c, access.TreeID, nil)
	if err != nil {
		abortServerError(c, err)
		return
	}
	members, err := listMembersRepo(c, access.TreeID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	c.Header("Content-Disposition", `attachment; filename="family-tree-export.json"`)
	responseSuccess(c, gin.H{"exportedAt": time.Now(), "tree": tree, "people": people, "families": families, "members": members}, 200)
}
