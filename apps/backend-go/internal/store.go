package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// preloadOwners loads ownership links plus the (non-deleted) owning users.
func preloadOwners(db *gorm.DB) *gorm.DB {
	return db.Preload("OwnerLinks").Preload("OwnerLinks.Owner")
}

// byCreation gives list queries a stable order. Without it Postgres returns rows in physical order,
// which shifts whenever a row is rewritten.
func byCreation(db *gorm.DB) *gorm.DB { return db.Order("created_at, id") }

// unscoped lets populated person details include soft-deleted people, matching the old $lookup behavior.
func unscoped(db *gorm.DB) *gorm.DB { return db.Unscoped() }

func findUserById(ctx context.Context, id string) (*User, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/findUserById").End()

	cacheKey := cacheKeyUser(id)
	if cached, ok := cacheGet[*User](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var row userRow
	if err := DB.WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("not found")
		}
		return nil, err
	}
	u := row.toModel()
	cacheSet(ctx, cacheKey, u, cacheTTLUser)
	return u, nil
}

func findUserByUsername(ctx context.Context, username string) (*User, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/findUserByUsername").End()

	cacheKey := cacheKeyUsername(username)
	if cached, ok := cacheGet[*User](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var row userRow
	if err := DB.WithContext(ctx).Where("username = ?", username).First(&row).Error; err != nil {
		return nil, err
	}
	u := row.toModel()
	cacheSet(ctx, cacheKey, u, cacheTTLUser)
	return u, nil
}

// addUser creates a user and, when treeID is set, adds them to that tree with the given role.
func addUser(ctx context.Context, u *User, treeID string, role TreeRole) (*User, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/addUser").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	row := userRow{Name: u.Name, Username: u.Username, Password: u.Password, Role: string(u.Role)}
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		if treeID == "" {
			return nil
		}
		return tx.Create(&treeMemberRow{TreeID: treeID, UserID: row.ID, Role: string(role)}).Error
	})
	if err != nil {
		return nil, err
	}
	cacheDel(ctx, cacheKeyUsersList(), cacheKeyUsername(u.Username))
	return findUserById(ctx, row.ID)
}

func repoGetAllPeople(ctx context.Context, ownedBy []string) ([]*Person, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/repoGetAllPeople").End()

	cacheKey := cacheKeyPeople(ownedBy)
	if cached, ok := cacheGet[[]*Person](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	q := preloadOwners(DB.WithContext(ctx)).
		Preload("Relationships", byCreation).
		Preload("Relationships.To", unscoped)
	if len(ownedBy) > 0 {
		q = q.Where("id IN (?)", DB.Model(&personOwner{}).Select("person_id").Where("user_id IN ?", ownedBy))
	}
	var rows []personRow
	if err := byCreation(q).Find(&rows).Error; err != nil {
		return nil, err
	}
	res := make([]*Person, 0, len(rows))
	for i := range rows {
		res = append(res, rows[i].toModel())
	}
	cacheSet(ctx, cacheKey, res, cacheTTLPeople)
	return res, nil
}

func getPersonByIdRepo(ctx context.Context, id string) (*Person, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/getPersonByIdRepo").End()

	cacheKey := cacheKeyPerson(id)
	if cached, ok := cacheGet[*Person](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var row personRow
	if err := preloadOwners(DB.WithContext(ctx)).Where("id = ?", id).First(&row).Error; err != nil {
		return nil, err
	}
	p := row.toModel()
	cacheSet(ctx, cacheKey, p, cacheTTLPerson)
	return p, nil
}

func createPersonRepo(ctx context.Context, p *Person) (*Person, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/createPersonRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if p.TreeID == "" {
		return nil, errNoTree
	}
	row := newPersonRow(p)
	row.ID = ""
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		if links := personOwnerRows([]string{row.ID}, p.OwnedBy); len(links) > 0 {
			return tx.Create(&links).Error
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	created, err := getPersonByIdRepo(ctx, row.ID)
	if err == nil {
		cacheDel(ctx, cacheKeyPeople(nil), cacheKeyPeople(p.OwnedBy))
	}
	return created, err
}

func updatePersonRepo(ctx context.Context, p *Person) (*Person, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/updatePersonRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	row := newPersonRow(p)
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&personRow{}).Where("id = ?", p.ID).
			Select("name", "nickname", "address", "status", "gender", "birth_date", "phone", "photo_url").
			Updates(row)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return replacePersonOwners(tx, []string{p.ID}, p.OwnedBy)
	})
	if err != nil {
		return nil, err
	}
	cacheDel(ctx, cacheKeyPerson(p.ID), cacheKeyPeople(nil), cacheKeyPeople(p.OwnedBy))
	cacheDelPattern(ctx, redisKeyPrefix+"relationships:*")
	return getPersonByIdRepo(ctx, p.ID)
}

func deletePersonRepo(ctx context.Context, id string) (*Person, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/deletePersonRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Soft delete: return the person as it was before deletion
	var row personRow
	if err := preloadOwners(DB.WithContext(ctx)).Where("id = ?", id).First(&row).Error; err != nil {
		return nil, err
	}
	if err := DB.WithContext(ctx).Delete(&personRow{}, "id = ?", id).Error; err != nil {
		return nil, err
	}
	cacheDel(ctx, cacheKeyPerson(id), cacheKeyPeople(nil))
	cacheDelPattern(ctx, redisKeyPrefix+"relationships:*")
	return row.toModel(), nil
}

func getAllFamiliesRepo(ctx context.Context, ownedBy []string) ([]*Family, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/getAllFamiliesRepo").End()

	cacheKey := cacheKeyFamilies(ownedBy)
	if cached, ok := cacheGet[[]*Family](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	q := DB.WithContext(ctx).Preload("OwnerLinks").Preload("Person", unscoped)
	if len(ownedBy) > 0 {
		q = q.Where("id IN (?)", DB.Model(&familyOwner{}).Select("family_id").Where("user_id IN ?", ownedBy))
	}
	var rows []familyRow
	if err := byCreation(q).Find(&rows).Error; err != nil {
		return nil, err
	}
	res := make([]*Family, 0, len(rows))
	for i := range rows {
		res = append(res, rows[i].toModel())
	}
	cacheSet(ctx, cacheKey, res, cacheTTLFamilies)
	return res, nil
}

// getFamilyByIdRepo fetches a single family by ID with person populated, using the cache.
func getFamilyByIdRepo(ctx context.Context, id string) (*Family, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/getFamilyByIdRepo").End()

	cacheKey := cacheKeyFamily(id)
	if cached, ok := cacheGet[*Family](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var row familyRow
	if err := DB.WithContext(ctx).Preload("OwnerLinks").Preload("Person", unscoped).
		Where("id = ?", id).First(&row).Error; err != nil {
		return nil, err
	}
	out := row.toModel()
	cacheSet(ctx, cacheKey, out, cacheTTLFamily)
	return out, nil
}

func createFamilyRepo(ctx context.Context, f *Family) (*Family, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/createFamilyRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if f.Person == nil || f.Person.ID == "" {
		return nil, errors.New("person is required")
	}
	personID := f.Person.ID
	row := familyRow{Name: f.Name, PersonID: &personID}
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		trees, err := treeIDsOfPeople(tx, []string{personID})
		if err != nil {
			return err
		}
		treeID, ok := trees[personID]
		if !ok {
			return gorm.ErrRecordNotFound
		}
		row.TreeID = treeID
		if err := tx.Omit("Person").Create(&row).Error; err != nil {
			return err
		}
		if links := familyOwnerRows(row.ID, f.OwnedBy); len(links) > 0 {
			return tx.Create(&links).Error
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	cacheDelPattern(ctx, redisKeyPrefix+"families:*")
	return getFamilyByIdRepo(ctx, row.ID)
}

func deleteFamilyRepo(ctx context.Context, id string) (*Family, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/deleteFamilyRepo").End()

	out, err := getFamilyByIdRepo(ctx, id)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := DB.WithContext(ctx).Delete(&familyRow{}, "id = ?", id).Error; err != nil {
		return nil, err
	}

	cacheDel(ctx, cacheKeyFamily(id))
	cacheDelPattern(ctx, redisKeyPrefix+"families:*")
	return out, nil
}

func repoFindUsers(ctx context.Context, role UserRole) ([]User, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/repoFindUsers").End()

	cacheKey := cacheKeyUsersList()
	if cached, ok := cacheGet[[]User](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var rows []userRow
	if err := byCreation(DB.WithContext(ctx)).Where("role = ?", string(role)).Find(&rows).Error; err != nil {
		return nil, err
	}
	res := make([]User, 0, len(rows))
	for i := range rows {
		u := rows[i].toModel()
		u.Password = ""
		res = append(res, *u)
	}
	cacheSet(ctx, cacheKey, res, cacheTTLUsers)
	return res, nil
}

// Relationship repository functions
func getRelationshipsByPersonIdRepo(ctx context.Context, personId string) ([]*Relationship, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/getRelationshipsByPersonIdRepo").End()

	cacheKey := cacheKeyRelationships(personId)
	if cached, ok := cacheGet[[]*Relationship](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	debug := os.Getenv("TREE_DEBUG") == "1"
	if debug {
		fmt.Printf("[STORE] getRelationshipsByPersonId: personId=%s\n", personId)
	}

	var rows []relationshipRow
	if err := DB.WithContext(ctx).
		Preload("From", unscoped).
		Preload("To", unscoped).
		Where("from_id = ? OR to_id = ?", personId, personId).
		Scopes(byCreation).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	res := make([]*Relationship, 0, len(rows))
	for i := range rows {
		res = append(res, rows[i].toModel())
	}

	if debug {
		fmt.Printf("[STORE] getRelationshipsByPersonId: found %d relationships\n", len(res))
		for _, r := range res {
			fmt.Printf("[STORE]   rel: from=%s to=%s type=%s\n", r.From, r.To, r.Type)
		}
	}

	cacheSet(ctx, cacheKey, res, cacheTTLRelationships)
	return res, nil
}

func insertManyRelationshipsRepo(ctx context.Context, rels []Relationship) error {
	defer newrelic.FromContext(ctx).StartSegment("store/insertManyRelationshipsRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	ids := make([]string, 0, len(rels)*2)
	for _, r := range rels {
		ids = append(ids, r.From, r.To)
	}
	trees, err := treeIDsOfPeople(DB.WithContext(ctx), ids)
	if err != nil {
		return err
	}
	rows := make([]relationshipRow, 0, len(rels))
	for _, r := range rels {
		if r.From == "" || r.To == "" {
			continue // Skip invalid IDs
		}
		treeID, err := sameTreeID(trees, r.From, r.To)
		if err != nil {
			return err
		}
		rows = append(rows, relationshipRow{TreeID: treeID, FromID: r.From, ToID: r.To, Type: r.Type, SortOrder: r.Order})
	}
	if len(rows) == 0 {
		return nil
	}
	// A relationship that already exists is skipped instead of failing the whole batch.
	err = DB.WithContext(ctx).Omit("From", "To").Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error
	if err == nil {
		// Invalidate cached relationships and individual person data for every person involved.
		seen := map[string]struct{}{}
		for _, r := range rels {
			if _, ok := seen[r.From]; !ok {
				cacheDel(ctx, cacheKeyRelationships(r.From), cacheKeyPerson(r.From))
				seen[r.From] = struct{}{}
			}
			if _, ok := seen[r.To]; !ok {
				cacheDel(ctx, cacheKeyRelationships(r.To), cacheKeyPerson(r.To))
				seen[r.To] = struct{}{}
			}
		}
		cacheDel(ctx, cacheKeyPeople(nil))
	}
	return err
}

func updateRelationshipRepo(ctx context.Context, r Relationship) (*Relationship, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/updateRelationshipRepo").End()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if r.ID == "" {
		return nil, fmt.Errorf("invalid relationship ID")
	}
	if r.From == "" || r.To == "" {
		return nil, fmt.Errorf("invalid from or to ID")
	}

	trees, err := treeIDsOfPeople(DB.WithContext(ctx), []string{r.From, r.To})
	if err != nil {
		return nil, err
	}
	treeID, err := sameTreeID(trees, r.From, r.To)
	if err != nil {
		return nil, err
	}

	res := DB.WithContext(ctx).Model(&relationshipRow{}).Where("id = ? AND tree_id = ?", r.ID, treeID).
		Select("from_id", "to_id", "type", "sort_order").
		Updates(relationshipRow{FromID: r.From, ToID: r.To, Type: r.Type, SortOrder: r.Order})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	var row relationshipRow
	if err := DB.WithContext(ctx).Where("id = ?", r.ID).First(&row).Error; err != nil {
		return nil, err
	}
	cacheDel(ctx,
		cacheKeyRelationships(r.From), cacheKeyRelationships(r.To),
		cacheKeyPerson(r.From), cacheKeyPerson(r.To),
	)
	cacheDel(ctx, cacheKeyPeople(nil))
	return row.toModel(), nil
}

func deleteRelationshipsRepo(ctx context.Context, ids []string) error {
	defer newrelic.FromContext(ctx).StartSegment("store/deleteRelationshipsRepo").End()
	if len(ids) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Soft delete: sets deleted_at instead of removing
	err := DB.WithContext(ctx).Where("id IN ?", ids).Delete(&relationshipRow{}).Error
	if err == nil {
		// Person IDs are unknown from relationship IDs alone — flush relationship and people caches.
		cacheDelPattern(ctx, redisKeyPrefix+"relationships:*")
		cacheDelPattern(ctx, redisKeyPrefix+"person:*")
		cacheDel(ctx, cacheKeyPeople(nil))
	}
	return err
}

// getRelationshipsByPersonIdsRepo fetches all non-deleted relationships for a batch of person IDs
// in one DB round-trip. Returns a map of personID → []*Relationship; each relationship is indexed
// under both its From and To IDs when they appear in the requested set.
func getRelationshipsByPersonIdsRepo(ctx context.Context, ids []string) (map[string][]*Relationship, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/getRelationshipsByPersonIdsRepo").End()

	result := make(map[string][]*Relationship, len(ids))
	if len(ids) == 0 {
		return result, nil
	}

	idSet := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}

	ctx2, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var rows []relationshipRow
	if err := byCreation(DB.WithContext(ctx2)).Where("from_id IN ? OR to_id IN ?", ids, ids).Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		r := rows[i].toModel()
		// Index under both From and To when they appear in the requested ID set.
		if _, ok := idSet[r.From]; ok {
			result[r.From] = append(result[r.From], r)
		}
		if _, ok := idSet[r.To]; ok {
			result[r.To] = append(result[r.To], r)
		}
	}
	return result, nil
}

// getPersonsByIdsRepo fetches basic person data (ID, Name, Nickname, Gender) for a batch of IDs
// in one DB round-trip. Uses individual cache entries where available; does not write back.
// Returns a map of personID → *Person.
func getPersonsByIdsRepo(ctx context.Context, ids []string) (map[string]*Person, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/getPersonsByIdsRepo").End()

	result := make(map[string]*Person, len(ids))
	if len(ids) == 0 {
		return result, nil
	}

	// Use cached full-person entries where available (avoids a DB call per cache hit).
	var missing []string
	for _, id := range ids {
		if cached, ok := cacheGet[*Person](ctx, cacheKeyPerson(id)); ok {
			result[id] = cached
		} else {
			missing = append(missing, id)
		}
	}
	if len(missing) == 0 {
		return result, nil
	}

	ctx2, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var rows []personRow
	if err := DB.WithContext(ctx2).Select("id", "name", "nickname", "gender").
		Where("id IN ?", missing).Find(&rows).Error; err != nil {
		return result, err
	}
	for _, row := range rows {
		result[row.ID] = &Person{ID: row.ID, Name: row.Name, Nickname: row.Nickname, Gender: row.Gender}
	}
	return result, nil
}

// updateOwnedByBatchRepo replaces the owners of multiple people in one transaction.
func updateOwnedByBatchRepo(ctx context.Context, ids []string, owners []string) error {
	defer newrelic.FromContext(ctx).StartSegment("store/updateOwnedByBatchRepo").End()
	if len(ids) == 0 {
		return nil
	}

	ctx2, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	err := DB.WithContext(ctx2).Transaction(func(tx *gorm.DB) error {
		return replacePersonOwners(tx, ids, owners)
	})
	if err == nil {
		delKeys := make([]string, 0, len(ids)+2)
		for _, id := range ids {
			delKeys = append(delKeys, cacheKeyPerson(id))
		}
		delKeys = append(delKeys, cacheKeyPeople(nil), cacheKeyPeople(owners))
		cacheDel(ctx, delKeys...)
	}
	return err
}

// replacePersonOwners swaps the ownership links of the given people for the given owners. Run inside a transaction.
func replacePersonOwners(tx *gorm.DB, personIDs, owners []string) error {
	if err := tx.Where("person_id IN ?", personIDs).Delete(&personOwner{}).Error; err != nil {
		return err
	}
	if links := personOwnerRows(personIDs, owners); len(links) > 0 {
		return tx.Create(&links).Error
	}
	return nil
}
