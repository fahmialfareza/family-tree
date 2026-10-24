package app

import (
	"context"
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
)

// Access model
//
// A tree is the security boundary: users who are not members get 404 for anything inside it.
// Inside a tree:
//   - every member can read any person, relationship and the tree view;
//   - owners can do everything, viewers can only read;
//   - in a branch-scoped tree, editors only list and change the people/families shared with them
//     through person_owners / family_owners. In other trees editors can change everything.

var treeRoleRank = map[TreeRole]int{TreeRoleViewer: 1, TreeRoleEditor: 2, TreeRoleOwner: 3}

type treeAccess struct {
	TreeID       string
	UserID       string
	Role         TreeRole
	BranchScoped bool
}

func (a *treeAccess) atLeast(role TreeRole) bool { return treeRoleRank[a.Role] >= treeRoleRank[role] }

// seesWholeTree reports whether lists and edits are unrestricted by person/family ownership.
func (a *treeAccess) seesWholeTree() bool { return a.Role == TreeRoleOwner || !a.BranchScoped }

// listOwnerFilter returns the owner filter for people/family lists: nil for the whole tree.
func (a *treeAccess) listOwnerFilter() []string {
	if a.seesWholeTree() {
		return nil
	}
	return []string{a.UserID}
}

func (a *treeAccess) canWritePerson(ctx context.Context, personID string) (bool, error) {
	if !a.atLeast(TreeRoleEditor) {
		return false, nil
	}
	if a.seesWholeTree() {
		return true, nil
	}
	return isOwnerOf(ctx, &personOwner{}, "person_id", personID, a.UserID)
}

// canWritePeople reports whether the caller may change every one of the given people.
func (a *treeAccess) canWritePeople(ctx context.Context, personIDs []string) (bool, error) {
	ids := dedupe(personIDs)
	if !a.atLeast(TreeRoleEditor) {
		return false, nil
	}
	if a.seesWholeTree() || len(ids) == 0 {
		return true, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var n int64
	err := DB.WithContext(ctx).Model(&personOwner{}).Where("person_id IN ? AND user_id = ?", ids, a.UserID).Count(&n).Error
	return n == int64(len(ids)), err
}

func (a *treeAccess) canWriteFamily(ctx context.Context, familyID string) (bool, error) {
	if !a.atLeast(TreeRoleEditor) {
		return false, nil
	}
	if a.seesWholeTree() {
		return true, nil
	}
	return isOwnerOf(ctx, &familyOwner{}, "family_id", familyID, a.UserID)
}

func isOwnerOf(ctx context.Context, model any, column, id, userID string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var n int64
	err := DB.WithContext(ctx).Model(model).Where(column+" = ? AND user_id = ?", id, userID).Count(&n).Error
	return n > 0, err
}

// loadTreeAccess returns the user's access to a live tree, or nil if they are not a member.
// Membership is read from Postgres on every request so role changes and removals apply immediately.
func loadTreeAccess(ctx context.Context, treeID, userID string) (*treeAccess, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/loadTreeAccess").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var row struct {
		Role         string
		BranchScoped bool
	}
	err := DB.WithContext(ctx).
		Table("tree_members").
		Select("tree_members.role, trees.branch_scoped").
		Joins("JOIN trees ON trees.id = tree_members.tree_id AND trees.deleted_at IS NULL").
		Where("tree_members.tree_id = ? AND tree_members.user_id = ?", treeID, userID).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &treeAccess{TreeID: treeID, UserID: userID, Role: TreeRole(row.Role), BranchScoped: row.BranchScoped}, nil
}

// treeResolver finds the tree a request targets. Returning gorm.ErrRecordNotFound or errNoTree yields 404.
type treeResolver func(c *gin.Context, user *User) (string, error)

// treeFromParam reads the tree ID from the /api/trees/:treeId routes.
func treeFromParam(c *gin.Context, _ *User) (string, error) { return c.Param("treeId"), nil }

// treeFromDefault serves legacy list/create routes, which have no tree in the URL.
func treeFromDefault(c *gin.Context, user *User) (string, error) {
	return defaultTreeIDForUser(c, user.ID)
}

// treeFromPerson serves legacy routes addressed by a (live) person ID.
func treeFromPerson(param string) treeResolver {
	return func(c *gin.Context, _ *User) (string, error) {
		return treeIDOf(c, &personRow{}, c.Param(param))
	}
}

// treeFromFamily serves legacy routes addressed by a (live) family ID.
func treeFromFamily(param string) treeResolver {
	return func(c *gin.Context, _ *User) (string, error) {
		return treeIDOf(c, &familyRow{}, c.Param(param))
	}
}

func treeIDOf(ctx context.Context, model any, id string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var treeID string
	err := DB.WithContext(ctx).Model(model).Select("tree_id").Where("id = ?", id).Take(&treeID).Error
	return treeID, err
}

// withTree resolves the target tree and requires the authenticated user to be a member with at least minRole.
// Non-members get 404 so the existence of other families' data is never revealed.
func withTree(resolve treeResolver, minRole TreeRole) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer newrelic.FromContext(c.Request.Context()).StartSegment("middleware/withTree").End()
		user := currentUser(c)
		treeID, err := resolve(c, user)
		if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, errNoTree) || (err == nil && treeID == "") {
			abortNotFound(c)
			return
		}
		if err != nil {
			abortServerError(c, err)
			return
		}
		access, err := loadTreeAccess(c, treeID, user.ID)
		if err != nil {
			abortServerError(c, err)
			return
		}
		if access == nil {
			abortNotFound(c)
			return
		}
		if !access.atLeast(minRole) {
			responseError(c, "Forbidden", 403)
			c.Abort()
			return
		}
		newrelic.FromContext(c.Request.Context()).AddAttribute("tree.id", treeID)
		c.Set("access", access)
		c.Next()
	}
}

func currentUser(c *gin.Context) *User {
	u, _ := c.Get("user")
	return u.(*User)
}

func currentAccess(c *gin.Context) *treeAccess {
	a, _ := c.Get("access")
	return a.(*treeAccess)
}

func abortNotFound(c *gin.Context) {
	responseError(c, "Not found", 404)
	c.Abort()
}

func abortServerError(c *gin.Context, err error) {
	newrelic.FromContext(c.Request.Context()).NoticeError(err)
	responseError(c, "Internal Server Error", 500)
	c.Abort()
}

// requireWritePerson checks the per-person rule for the person addressed by the :id param.
func requireWritePerson(c *gin.Context, personID string) bool {
	ok, err := currentAccess(c).canWritePerson(c, personID)
	if err != nil {
		abortServerError(c, err)
		return false
	}
	if !ok {
		responseError(c, "Forbidden", 403)
		c.Abort()
		return false
	}
	return true
}
