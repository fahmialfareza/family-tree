package app

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
)

// Users are not cached: every authenticated request loads the user together with its session
// (sessionUser), so deletions, role changes and revocations apply immediately.

var (
	errEmailTaken    = errors.New("email is already registered")
	errUsernameTaken = errors.New("username is already taken")
	errSoleOwner     = errors.New("user is the only owner of trees that have other members")
)

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func isUniqueViolation(err error, index string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && (index == "" || pgErr.ConstraintName == index)
}

// findUserByLogin looks a user up by email (case-insensitive) or username.
func findUserByLogin(ctx context.Context, identifier string) (*User, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/findUserByLogin").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	identifier = strings.TrimSpace(identifier)
	var row userRow
	q := DB.WithContext(ctx)
	if strings.Contains(identifier, "@") {
		q = q.Where("lower(email) = ?", normalizeEmail(identifier))
	} else {
		q = q.Where("username = ?", identifier)
	}
	if err := q.First(&row).Error; err != nil {
		return nil, err
	}
	return row.toModel(), nil
}

func findUserByEmail(ctx context.Context, email string) (*userRow, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var row userRow
	if err := DB.WithContext(ctx).Where("lower(email) = ?", normalizeEmail(email)).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// addUser creates a user and, when treeID is set, adds them to that tree with the given role.
func addUser(ctx context.Context, u *User, treeID string, role TreeRole) (*User, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/addUser").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	row := userRow{Name: u.Name, Username: strPtr(u.Username), Email: strPtr(normalizeEmail(u.Email)), Password: u.Password, Role: string(u.Role)}
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		if treeID == "" {
			return nil
		}
		return tx.Create(&treeMemberRow{TreeID: treeID, UserID: row.ID, Role: string(role)}).Error
	})
	switch {
	case isUniqueViolation(err, "idx_users_email_active"):
		return nil, errEmailTaken
	case isUniqueViolation(err, "idx_users_username_active"):
		return nil, errUsernameTaken
	case err != nil:
		return nil, err
	}
	return row.toModel(), nil
}

func updateUserName(ctx context.Context, userID, name string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return DB.WithContext(ctx).Model(&userRow{}).Where("id = ?", userID).Update("name", name).Error
}

// applyVerifiedEmail sets a verified email; called only after the address proved itself via a link.
func applyVerifiedEmail(tx *gorm.DB, userID, email string) error {
	err := tx.Model(&userRow{}).Where("id = ?", userID).
		Updates(map[string]any{"email": normalizeEmail(email), "email_verified_at": time.Now()}).Error
	if isUniqueViolation(err, "idx_users_email_active") {
		return errEmailTaken
	}
	return err
}

// emailInUse reports whether another account already uses the address (verified or pending).
func emailInUse(ctx context.Context, email, exceptUserID string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var n int64
	err := DB.WithContext(ctx).Model(&userRow{}).Where("lower(email) = ? AND id <> ?", normalizeEmail(email), exceptUserID).Count(&n).Error
	return n > 0, err
}

func setUserPassword(tx *gorm.DB, userID, hash string) error {
	return tx.Model(&userRow{}).Where("id = ?", userID).Update("password", hash).Error
}

// soleOwnedTrees splits the trees where userID is the only live owner into those other members
// still use (blocking deletion) and those nobody else is in (deleted with the account).
func soleOwnedTrees(db *gorm.DB, userID string) (shared []Tree, private []string, err error) {
	var rows []struct {
		ID      string
		Name    string
		Members int64
	}
	err = db.Raw(`
		SELECT t.id, t.name, (SELECT count(*) FROM tree_members m2 WHERE m2.tree_id = t.id) AS members
		FROM trees t
		JOIN tree_members m ON m.tree_id = t.id AND m.user_id = ? AND m.role = 'owner'
		WHERE t.deleted_at IS NULL
		  AND NOT EXISTS (
		    SELECT 1 FROM tree_members o JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
		    WHERE o.tree_id = t.id AND o.role = 'owner' AND o.user_id <> ?)`, userID, userID).
		Scan(&rows).Error
	if err != nil {
		return nil, nil, err
	}
	for _, r := range rows {
		if r.Members > 1 {
			shared = append(shared, Tree{ID: r.ID, Name: r.Name})
		} else {
			private = append(private, r.ID)
		}
	}
	return shared, private, nil
}

// deleteAccount permanently deletes the user, their sessions, memberships and branch shares,
// plus every tree only they belonged to (with all its people). Trees they solely own but share
// with others must be handed over first (errSoleOwner).
func deleteAccount(ctx context.Context, userID string) error {
	defer newrelic.FromContext(ctx).StartSegment("store/deleteAccount").End()
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	var deletedTrees []string
	var apple struct {
		AppleClientID     *string
		AppleRefreshToken *string
	}
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the user's memberships so ownership cannot change underneath the check.
		if err := tx.Exec("SELECT 1 FROM tree_members WHERE user_id = ? FOR UPDATE", userID).Error; err != nil {
			return err
		}
		shared, private, err := soleOwnedTrees(tx, userID)
		if err != nil {
			return err
		}
		if len(shared) > 0 {
			return errSoleOwner
		}
		if len(private) > 0 {
			// Cascades to people, families, relationships, owners, members and invites of those trees.
			if err := tx.Exec("DELETE FROM trees WHERE id IN ?", private).Error; err != nil {
				return err
			}
			deletedTrees = private
		}
		if err := tx.Table("users").Select("apple_client_id, apple_refresh_token").Where("id = ?", userID).Take(&apple).Error; err != nil {
			return err
		}
		// Cascades to sessions, auth tokens, memberships and person/family owner links.
		return tx.Exec("DELETE FROM users WHERE id = ?", userID).Error
	})
	if err != nil {
		return err
	}
	for _, id := range deletedTrees {
		bumpTreeCache(ctx, id)
	}
	if apple.AppleClientID != nil && apple.AppleRefreshToken != nil {
		revokeAppleToken(ctx, *apple.AppleClientID, *apple.AppleRefreshToken)
	}
	return nil
}
