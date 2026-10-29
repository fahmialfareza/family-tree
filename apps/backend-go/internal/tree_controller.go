package app

import (
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
)

const maxTreeNameLength = 120

func validTreeName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	return name, name != "" && len([]rune(name)) <= maxTreeNameLength
}

func parseTreeRole(s string) (TreeRole, bool) {
	r := TreeRole(s)
	_, ok := treeRoleRank[r]
	return r, ok
}

func listTrees(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/listTrees").End()
	trees, err := listTreesForUser(c, currentUser(c).ID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, trees, 200)
}

func createTree(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/createTree").End()
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	name, ok := validTreeName(body.Name)
	if !ok {
		responseError(c, "Tree name is required (max 120 characters)", 400)
		return
	}
	tree, err := createTreeRepo(c, name, currentUser(c).ID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, tree, 201)
}

func getTree(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getTree").End()
	access := currentAccess(c)
	tree, err := getTreeRepo(c, access.TreeID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	tree.Role = access.Role
	responseSuccess(c, tree, 200)
}

func updateTree(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/updateTree").End()
	var body struct {
		Name             *string `json:"name"`
		BranchScoped     *bool   `json:"branchScoped"`
		AssistantEnabled *bool   `json:"assistantEnabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	if body.Name != nil {
		name, ok := validTreeName(*body.Name)
		if !ok {
			responseError(c, "Tree name is required (max 120 characters)", 400)
			return
		}
		body.Name = &name
	}
	access := currentAccess(c)
	tree, err := updateTreeRepo(c, access.TreeID, body.Name, body.BranchScoped, body.AssistantEnabled)
	if err != nil {
		abortServerError(c, err)
		return
	}
	tree.Role = access.Role
	responseSuccess(c, tree, 200)
}

func deleteTree(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/deleteTree").End()
	if err := deleteTreeRepo(c, currentAccess(c).TreeID); err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

func listMembers(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/listMembers").End()
	access := currentAccess(c)
	members, err := listMembersRepo(c, access.TreeID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if access.Role != TreeRoleOwner {
		for i := range members {
			members[i].Email = ""
		}
	}
	responseSuccess(c, members, 200)
}

func memberError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errLastOwner):
		responseError(c, "A tree must keep at least one owner", 409)
	case errors.Is(err, errNotMember):
		responseError(c, "Member not found", 404)
	default:
		abortServerError(c, err)
	}
}

func updateMember(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/updateMember").End()
	var body struct {
		Role string `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	role, ok := parseTreeRole(body.Role)
	if !ok {
		responseError(c, "Role must be owner, editor or viewer", 400)
		return
	}
	if err := setMemberRoleRepo(c, currentAccess(c).TreeID, c.Param("userId"), role); err != nil {
		memberError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

// removeMember lets owners remove anyone and any member remove themselves (leave the tree).
func removeMember(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/removeMember").End()
	access := currentAccess(c)
	userID := c.Param("userId")
	if userID != access.UserID && access.Role != TreeRoleOwner {
		responseError(c, "Forbidden", 403)
		return
	}
	if err := removeMemberRepo(c, access.TreeID, userID); err != nil {
		memberError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

func listInvites(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/listInvites").End()
	invites, err := listPendingInvitesRepo(c, currentAccess(c).TreeID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, invites, 200)
}

// createInvite returns the plaintext token once; only its hash is stored.
// Until transactional email exists the owner shares the token (as an invite link) themselves.
func createInvite(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/createInvite").End()
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	addr, err := mail.ParseAddress(strings.TrimSpace(body.Email))
	if err != nil || len(addr.Address) > 254 {
		responseError(c, "A valid email is required", 400)
		return
	}
	role, ok := parseTreeRole(body.Role)
	if !ok {
		responseError(c, "Role must be owner, editor or viewer", 400)
		return
	}
	access := currentAccess(c)
	if !limitByKey(c, "invites:"+access.UserID, 30, 24*time.Hour) {
		return
	}
	invite, token, err := createInviteRepo(c, access.TreeID, strings.ToLower(addr.Address), role, access.UserID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if tree, err := getTreeRepo(c, access.TreeID); err == nil {
		// The invitee's own language when they already have an account, else the inviter's current one.
		saved := ""
		if row, err := findUserByEmail(c, invite.Email); err == nil {
			saved = row.toModel().Locale
		}
		sendInviteEmail(invite.Email, mailLang(c, saved), currentUser(c).Name, tree.Name, token)
	}
	responseSuccess(c, gin.H{"invite": invite, "token": token}, 201)
}

func revokeInvite(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/revokeInvite").End()
	err := revokeInviteRepo(c, currentAccess(c).TreeID, c.Param("inviteId"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		responseError(c, "Invite not found", 404)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, true, 200)
}

func acceptInvite(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/acceptInvite").End()
	var body struct {
		Token string `json:"token"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
		responseError(c, "Invalid request body", 400)
		return
	}
	user := currentUser(c)
	email, err := verifiedEmailRepo(c, user.ID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	tree, err := acceptInviteRepo(c, body.Token, user, email)
	if errors.Is(err, errInviteInvalid) {
		// Not a live email invite: maybe an invite link (no email binding, many uses).
		tree, err = acceptInviteLinkRepo(c, body.Token, user)
	}
	switch {
	case errors.Is(err, errInviteInvalid):
		responseError(c, "This invite is invalid, expired or already used", 410)
	case errors.Is(err, errInviteEmail):
		responseError(c, "Sign in with the email address this invite was sent to, and verify it first", 403)
	case errors.Is(err, errAlreadyMember):
		responseError(c, "You are already a member of this tree", 409)
	case err != nil:
		abortServerError(c, err)
	default:
		responseSuccess(c, tree, 200)
	}
}
