package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	errNoTree    = errors.New("user does not belong to any tree")
	errCrossTree = errors.New("people belong to different trees")
)

// defaultTreeIDForUser returns the tree a user joined first. The legacy (non tree-scoped) routes
// use it to place new rows until the API takes an explicit tree ID.
func defaultTreeIDForUser(ctx context.Context, userID string) (string, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/defaultTreeIDForUser").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var treeID string
	err := DB.WithContext(ctx).
		Table("tree_members").
		Select("tree_members.tree_id").
		Joins("JOIN trees ON trees.id = tree_members.tree_id AND trees.deleted_at IS NULL").
		Where("tree_members.user_id = ?", userID).
		Order("tree_members.created_at, tree_members.tree_id").
		Limit(1).
		Scan(&treeID).Error
	if err != nil {
		return "", err
	}
	if treeID == "" {
		return "", errNoTree
	}
	return treeID, nil
}

// treeIDsOfPeople maps each person ID (including soft-deleted people) to its tree ID.
func treeIDsOfPeople(db *gorm.DB, ids []string) (map[string]string, error) {
	var rows []struct {
		ID     string
		TreeID string
	}
	if err := db.Unscoped().Model(&personRow{}).Select("id", "tree_id").Where("id IN ?", dedupe(ids)).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		out[r.ID] = r.TreeID
	}
	return out, nil
}

// sameTreeID returns the tree shared by both people, or an error if either is missing or they differ.
func sameTreeID(trees map[string]string, fromID, toID string) (string, error) {
	from, ok := trees[fromID]
	if !ok {
		return "", gorm.ErrRecordNotFound
	}
	to, ok := trees[toID]
	if !ok {
		return "", gorm.ErrRecordNotFound
	}
	if from != to {
		return "", errCrossTree
	}
	return from, nil
}

var (
	errLastOwner     = errors.New("a tree must keep at least one owner")
	errNotMember     = errors.New("user is not a member of this tree")
	errAlreadyMember = errors.New("user is already a member of this tree")
	errInviteInvalid = errors.New("invite is invalid, expired or already used")
	errInviteEmail   = errors.New("invite was sent to a different email address")
)

const inviteTTL = 7 * 24 * time.Hour

// listTreesForUser returns the live trees the user belongs to, with their role in each.
func listTreesForUser(ctx context.Context, userID string) ([]Tree, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/listTreesForUser").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	out := []Tree{}
	err := DB.WithContext(ctx).
		Table("trees").
		Select("trees.id, trees.name, trees.branch_scoped, trees.created_at, tree_members.role").
		Joins("JOIN tree_members ON tree_members.tree_id = trees.id AND tree_members.user_id = ?", userID).
		Where("trees.deleted_at IS NULL").
		Order("tree_members.created_at, trees.id").
		Scan(&out).Error
	return out, err
}

func getTreeRepo(ctx context.Context, treeID string) (*Tree, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var row treeRow
	if err := DB.WithContext(ctx).Where("id = ?", treeID).First(&row).Error; err != nil {
		return nil, err
	}
	return &Tree{ID: row.ID, Name: row.Name, BranchScoped: row.BranchScoped, CreatedAt: row.CreatedAt}, nil
}

// createTreeRepo creates a tree owned by userID. New trees share everything with editors by default.
func createTreeRepo(ctx context.Context, name, userID string) (*Tree, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/createTreeRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	row := treeRow{Name: name, CreatedBy: &userID}
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		return tx.Create(&treeMemberRow{TreeID: row.ID, UserID: userID, Role: string(TreeRoleOwner)}).Error
	})
	if err != nil {
		return nil, err
	}
	return &Tree{ID: row.ID, Name: row.Name, BranchScoped: row.BranchScoped, Role: TreeRoleOwner, CreatedAt: row.CreatedAt}, nil
}

func updateTreeRepo(ctx context.Context, treeID string, name *string, branchScoped *bool) (*Tree, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	updates := map[string]any{}
	if name != nil {
		updates["name"] = *name
	}
	if branchScoped != nil {
		updates["branch_scoped"] = *branchScoped
	}
	if len(updates) > 0 {
		updates["updated_at"] = time.Now()
		if err := DB.WithContext(ctx).Model(&treeRow{}).Where("id = ?", treeID).Updates(updates).Error; err != nil {
			return nil, err
		}
		bumpTreeCache(ctx, treeID)
	}
	return getTreeRepo(ctx, treeID)
}

// deleteTreeRepo soft-deletes a tree; members lose access immediately because membership checks skip deleted trees.
func deleteTreeRepo(ctx context.Context, treeID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := DB.WithContext(ctx).Delete(&treeRow{}, "id = ?", treeID).Error; err != nil {
		return err
	}
	bumpTreeCache(ctx, treeID)
	return nil
}

func listMembersRepo(ctx context.Context, treeID string) ([]TreeMember, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var rows []struct {
		UserID    string
		Name      string
		Username  string
		Email     *string
		Role      string
		CreatedAt time.Time
	}
	err := DB.WithContext(ctx).
		Table("tree_members").
		Select("tree_members.user_id, users.name, users.username, users.email, tree_members.role, tree_members.created_at").
		Joins("JOIN users ON users.id = tree_members.user_id AND users.deleted_at IS NULL").
		Where("tree_members.tree_id = ?", treeID).
		Order("tree_members.created_at, tree_members.user_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]TreeMember, 0, len(rows))
	for _, r := range rows {
		m := TreeMember{UserID: r.UserID, Name: r.Name, Username: r.Username, Role: TreeRole(r.Role), JoinedAt: r.CreatedAt}
		if r.Email != nil {
			m.Email = *r.Email
		}
		out = append(out, m)
	}
	return out, nil
}

// ensureOwnerRemains fails if removing or demoting userID would leave the tree without an owner.
// Run inside a transaction; owner rows are locked so concurrent changes cannot both pass the check.
func ensureOwnerRemains(tx *gorm.DB, treeID, userID string) error {
	var owners []string
	if err := tx.Model(&treeMemberRow{}).Clauses(clause.Locking{Strength: "UPDATE", Table: clause.Table{Name: "tree_members"}}).
		Joins("JOIN users ON users.id = tree_members.user_id AND users.deleted_at IS NULL").
		Where("tree_members.tree_id = ? AND tree_members.role = ?", treeID, string(TreeRoleOwner)).
		Pluck("tree_members.user_id", &owners).Error; err != nil {
		return err
	}
	for _, id := range owners {
		if id != userID {
			return nil
		}
	}
	return errLastOwner
}

func setMemberRoleRepo(ctx context.Context, treeID, userID string, role TreeRole) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if role != TreeRoleOwner {
			if err := ensureOwnerRemains(tx, treeID, userID); err != nil {
				return err
			}
		}
		res := tx.Model(&treeMemberRow{}).Where("tree_id = ? AND user_id = ?", treeID, userID).Update("role", string(role))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errNotMember
		}
		if role != TreeRoleOwner {
			return revokeInvitesBy(tx, treeID, userID)
		}
		return nil
	})
	if err == nil {
		bumpTreeCache(ctx, treeID)
	}
	return err
}

// removeMemberRepo removes a member and the branch shares they held in this tree.
func removeMemberRepo(ctx context.Context, treeID, userID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := ensureOwnerRemains(tx, treeID, userID); err != nil {
			return err
		}
		res := tx.Where("tree_id = ? AND user_id = ?", treeID, userID).Delete(&treeMemberRow{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errNotMember
		}
		if err := revokeInvitesBy(tx, treeID, userID); err != nil {
			return err
		}
		treePeople := tx.Unscoped().Model(&personRow{}).Select("id").Where("tree_id = ?", treeID)
		if err := tx.Where("user_id = ? AND person_id IN (?)", userID, treePeople).Delete(&personOwner{}).Error; err != nil {
			return err
		}
		treeFamilies := tx.Unscoped().Model(&familyRow{}).Select("id").Where("tree_id = ?", treeID)
		return tx.Where("user_id = ? AND family_id IN (?)", userID, treeFamilies).Delete(&familyOwner{}).Error
	})
	if err == nil {
		bumpTreeCache(ctx, treeID)
	}
	return err
}

// revokeInvitesBy revokes the pending invites a user sent in a tree, used when they stop being an owner.
func revokeInvitesBy(tx *gorm.DB, treeID, userID string) error {
	return tx.Model(&treeInviteRow{}).
		Where("tree_id = ? AND invited_by = ? AND accepted_at IS NULL AND revoked_at IS NULL", treeID, userID).
		Update("revoked_at", time.Now()).Error
}

// areMembers reports whether every user ID is a member of the tree.
func areMembers(ctx context.Context, treeID string, userIDs []string) (bool, error) {
	ids := dedupe(userIDs)
	if len(ids) == 0 {
		return true, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var n int64
	err := DB.WithContext(ctx).Model(&treeMemberRow{}).Where("tree_id = ? AND user_id IN ?", treeID, ids).Count(&n).Error
	return n == int64(len(ids)), err
}

func hashInviteToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// createInviteRepo stores an invite and returns it with the one-time plaintext token.
// A pending invite for the same email in the same tree is revoked first.
func createInviteRepo(ctx context.Context, treeID, email string, role TreeRole, invitedBy string) (*TreeInvite, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	now := time.Now()
	row := treeInviteRow{
		ID:        uuid.Must(uuid.NewV7()).String(),
		TreeID:    treeID,
		Email:     email,
		Role:      string(role),
		TokenHash: hashInviteToken(token),
		InvitedBy: &invitedBy,
		ExpiresAt: now.Add(inviteTTL),
		CreatedAt: now,
	}
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&treeInviteRow{}).
			Where("tree_id = ? AND lower(email) = lower(?) AND accepted_at IS NULL AND revoked_at IS NULL", treeID, email).
			Update("revoked_at", now).Error; err != nil {
			return err
		}
		return tx.Create(&row).Error
	})
	if err != nil {
		return nil, "", err
	}
	return row.toModel(), token, nil
}

func listPendingInvitesRepo(ctx context.Context, treeID string) ([]*TreeInvite, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var rows []treeInviteRow
	if err := DB.WithContext(ctx).
		Where("tree_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()", treeID).
		Order("created_at, id").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]*TreeInvite, 0, len(rows))
	for i := range rows {
		out = append(out, rows[i].toModel())
	}
	return out, nil
}

func revokeInviteRepo(ctx context.Context, treeID, inviteID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	res := DB.WithContext(ctx).Model(&treeInviteRow{}).
		Where("id = ? AND tree_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", inviteID, treeID).
		Update("revoked_at", time.Now())
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// acceptInviteRepo adds the user to the invite's tree. Single use: the invite row is locked and stamped.
// The token alone is not enough: the account's email must match the invited address, and the inviter must
// still be an owner of the tree (so invites die with the ownership that created them).
func acceptInviteRepo(ctx context.Context, token string, user *User, userEmail string) (*Tree, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/acceptInviteRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var invite treeInviteRow
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()", hashInviteToken(token)).
			Take(&invite).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errInviteInvalid
		}
		if err != nil {
			return err
		}
		var live int64
		if err := tx.Model(&treeRow{}).Where("id = ?", invite.TreeID).Count(&live).Error; err != nil {
			return err
		}
		if live == 0 {
			return errInviteInvalid
		}
		var inviterIsOwner int64
		if err := tx.Model(&treeMemberRow{}).
			Joins("JOIN users ON users.id = tree_members.user_id AND users.deleted_at IS NULL").
			Where("tree_members.tree_id = ? AND tree_members.user_id = ? AND tree_members.role = ?", invite.TreeID, invite.InvitedBy, string(TreeRoleOwner)).
			Count(&inviterIsOwner).Error; err != nil {
			return err
		}
		if inviterIsOwner == 0 {
			return errInviteInvalid
		}
		if userEmail == "" || !strings.EqualFold(userEmail, invite.Email) {
			return errInviteEmail
		}
		var existing int64
		if err := tx.Model(&treeMemberRow{}).Where("tree_id = ? AND user_id = ?", invite.TreeID, user.ID).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return errAlreadyMember
		}
		if err := tx.Create(&treeMemberRow{TreeID: invite.TreeID, UserID: user.ID, Role: invite.Role}).Error; err != nil {
			return err
		}
		return tx.Model(&treeInviteRow{}).Where("id = ?", invite.ID).Update("accepted_at", time.Now()).Error
	})
	if err != nil {
		return nil, err
	}
	tree, err := getTreeRepo(ctx, invite.TreeID)
	if err != nil {
		return nil, err
	}
	tree.Role = TreeRole(invite.Role)
	return tree, nil
}

// verifiedEmailRepo returns the user's email only once it is verified.
func verifiedEmailRepo(ctx context.Context, userID string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var row struct{ Email *string }
	if err := DB.WithContext(ctx).Model(&userRow{}).Select("email").
		Where("id = ? AND email_verified_at IS NOT NULL", userID).Scan(&row).Error; err != nil {
		return "", err
	}
	return deref(row.Email), nil
}
