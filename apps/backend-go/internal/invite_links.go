package app

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Invite links: a shareable /invite?token=... that any signed-in person can use until it expires or is
// revoked, as many times as needed. Email invites stay single-use and bound to an address. Links can grant
// editor or viewer only: a link can be forwarded anywhere, so it never hands out ownership.

var inviteLinkDays = map[int]bool{1: true, 7: true, 30: true}

type treeInviteLinkRow struct {
	ID        string `gorm:"primaryKey;type:text"`
	TreeID    string `gorm:"type:text"`
	Role      string
	TokenHash string
	InvitedBy *string `gorm:"type:text"`
	ExpiresAt time.Time
	RevokedAt *time.Time
	Uses      int
	CreatedAt time.Time
}

func (treeInviteLinkRow) TableName() string { return "tree_invite_links" }

type TreeInviteLink struct {
	ID        string    `json:"_id"`
	TreeID    string    `json:"treeId"`
	Role      TreeRole  `json:"role"`
	Uses      int       `json:"uses"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
	CreatedBy string    `json:"createdBy,omitempty"` // name of the owner who made it
}

func newInviteToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// inviterStillOwner: links and invites die with the ownership that created them.
func inviterStillOwner(tx *gorm.DB, treeID string, invitedBy *string) (bool, error) {
	if invitedBy == nil {
		return false, nil
	}
	var n int64
	err := tx.Model(&treeMemberRow{}).
		Joins("JOIN users ON users.id = tree_members.user_id AND users.deleted_at IS NULL").
		Where("tree_members.tree_id = ? AND tree_members.user_id = ? AND tree_members.role = ?", treeID, *invitedBy, string(TreeRoleOwner)).
		Count(&n).Error
	return n > 0, err
}

func listInviteLinks(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/listInviteLinks").End()
	var rows []struct {
		ID          string
		TreeID      string
		Role        string
		Uses        int
		ExpiresAt   time.Time
		CreatedAt   time.Time
		CreatorName *string
	}
	err := DB.WithContext(c).Table("tree_invite_links l").
		Select("l.id, l.tree_id, l.role, l.uses, l.expires_at, l.created_at, u.name AS creator_name").
		Joins("LEFT JOIN users u ON u.id = l.invited_by").
		Where("l.tree_id = ? AND l.revoked_at IS NULL AND l.expires_at > now()", currentAccess(c).TreeID).
		Order("l.created_at DESC, l.id").Scan(&rows).Error
	if err != nil {
		abortServerError(c, err)
		return
	}
	out := make([]TreeInviteLink, 0, len(rows))
	for _, r := range rows {
		out = append(out, TreeInviteLink{ID: r.ID, TreeID: r.TreeID, Role: TreeRole(r.Role), Uses: r.Uses,
			ExpiresAt: r.ExpiresAt, CreatedAt: r.CreatedAt, CreatedBy: deref(r.CreatorName)})
	}
	responseSuccess(c, out, 200)
}

// createInviteLink: {role: editor|viewer, days: 1|7|30}. The plaintext token is returned once.
func createInviteLink(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/createInviteLink").End()
	var body struct {
		Role string `json:"role"`
		Days int    `json:"days"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	if body.Role != string(TreeRoleEditor) && body.Role != string(TreeRoleViewer) {
		responseError(c, "Invite links can make editors or viewers", 400)
		return
	}
	if !inviteLinkDays[body.Days] {
		responseError(c, "Links expire after 1, 7 or 30 days", 400)
		return
	}
	access := currentAccess(c)
	if !limitByKey(c, "invites:"+access.UserID, 30, 24*time.Hour) {
		return
	}
	token, err := newInviteToken()
	if err != nil {
		abortServerError(c, err)
		return
	}
	now := time.Now()
	row := treeInviteLinkRow{ID: uuid.Must(uuid.NewV7()).String(), TreeID: access.TreeID, Role: body.Role,
		TokenHash: hashInviteToken(token), InvitedBy: &access.UserID, ExpiresAt: now.AddDate(0, 0, body.Days), CreatedAt: now}
	if err := DB.WithContext(c).Create(&row).Error; err != nil {
		abortServerError(c, err)
		return
	}
	link := TreeInviteLink{ID: row.ID, TreeID: row.TreeID, Role: TreeRole(row.Role), ExpiresAt: row.ExpiresAt,
		CreatedAt: row.CreatedAt, CreatedBy: currentUser(c).Name}
	responseSuccess(c, gin.H{"link": link, "token": token}, 201)
}

func revokeInviteLink(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/revokeInviteLink").End()
	res := DB.WithContext(c).Model(&treeInviteLinkRow{}).
		Where("id = ? AND tree_id = ? AND revoked_at IS NULL", c.Param("linkId"), currentAccess(c).TreeID).
		Update("revoked_at", time.Now())
	if res.Error != nil {
		abortServerError(c, res.Error)
		return
	}
	if res.RowsAffected == 0 {
		responseError(c, "Invite link not found", 404)
		return
	}
	responseSuccess(c, true, 200)
}

// acceptInviteLinkRepo adds the user with the link's role. errInviteInvalid when the token is not a live link.
func acceptInviteLinkRepo(ctx context.Context, token string, user *User) (*Tree, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var link treeInviteLinkRow
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("token_hash = ? AND revoked_at IS NULL AND expires_at > now()", hashInviteToken(token)).Take(&link).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errInviteInvalid
		}
		if err != nil {
			return err
		}
		var live int64
		if err := tx.Model(&treeRow{}).Where("id = ?", link.TreeID).Count(&live).Error; err != nil {
			return err
		}
		ok, err := inviterStillOwner(tx, link.TreeID, link.InvitedBy)
		if err != nil {
			return err
		}
		if live == 0 || !ok {
			return errInviteInvalid
		}
		var existing int64
		if err := tx.Model(&treeMemberRow{}).Where("tree_id = ? AND user_id = ?", link.TreeID, user.ID).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return errAlreadyMember
		}
		if err := tx.Create(&treeMemberRow{TreeID: link.TreeID, UserID: user.ID, Role: link.Role}).Error; err != nil {
			return err
		}
		return tx.Model(&treeInviteLinkRow{}).Where("id = ?", link.ID).Update("uses", gorm.Expr("uses + 1")).Error
	})
	if err != nil {
		return nil, err
	}
	tree, err := getTreeRepo(ctx, link.TreeID)
	if err != nil {
		return nil, err
	}
	tree.Role = TreeRole(link.Role)
	return tree, nil
}

type invitePreview struct {
	Kind      string    `json:"kind"` // email | link
	TreeName  string    `json:"treeName"`
	InvitedBy string    `json:"invitedBy,omitempty"`
	Role      TreeRole  `json:"role"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// previewInvite serves GET /api/invites/preview?token=: what the invite is for, so the page can say
// "Fahmi invited you to Keluarga Reza as editor" before anyone signs in. Only the holder of a live token
// learns the tree's name; nothing else about the tree is shown.
func previewInvite(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" || len(token) > 200 {
		responseError(c, "This invite is invalid, expired or already used", 410)
		return
	}
	var p struct {
		Kind      string
		TreeName  string
		InvitedBy *string
		Role      string
		ExpiresAt time.Time
	}
	hash := hashInviteToken(token)
	err := DB.WithContext(c).Raw(`
		SELECT 'link' AS kind, t.name AS tree_name, u.name AS invited_by, l.role, l.expires_at
		FROM tree_invite_links l JOIN trees t ON t.id = l.tree_id AND t.deleted_at IS NULL
		LEFT JOIN users u ON u.id = l.invited_by
		WHERE l.token_hash = ? AND l.revoked_at IS NULL AND l.expires_at > now()
		UNION ALL
		SELECT 'email', t.name, u.name, i.role, i.expires_at
		FROM tree_invites i JOIN trees t ON t.id = i.tree_id AND t.deleted_at IS NULL
		LEFT JOIN users u ON u.id = i.invited_by
		WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
		LIMIT 1`, hash, hash).Scan(&p).Error
	if err != nil {
		abortServerError(c, err)
		return
	}
	if p.Kind == "" {
		responseError(c, "This invite is invalid, expired or already used", 410)
		return
	}
	responseSuccess(c, invitePreview{Kind: p.Kind, TreeName: p.TreeName, InvitedBy: deref(p.InvitedBy), Role: TreeRole(p.Role), ExpiresAt: p.ExpiresAt}, 200)
}
