package app

import (
	"context"
	"errors"
	"time"

	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
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
