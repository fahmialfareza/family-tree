package app

import (
	"context"
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Copying a branch from another tree (POST /api/trees/:treeId/import), and pulling later changes from the
// original into a copy (POST /api/trees/:treeId/people/:id/sync). Updates only ever flow one way, on demand.
//
// The caller picks a person in a source tree and a scope; those people and the relationships between them
// are copied into the destination tree as independent records. Only genealogy is copied (names, gender,
// living status, dates and places); photos, phone numbers, addresses and notes stay in the source tree.
// The caller must be an editor of the destination (route) and an owner or editor of the source; in a
// branch-scoped source tree editors can only copy people shared with them. A person already copied into the
// destination is reused, so repeating an import fills gaps instead of creating duplicates.

const maxImportPeople = 1000

var (
	errImportRootHidden = errors.New("root person cannot be copied by this user")
	errImportTooLarge   = errors.New("branch too large to copy")
)

type importScope string

const (
	scopeDescendants importScope = "descendants" // the person, their partners, children, and so on down
	scopeAncestors   importScope = "ancestors"   // the person, their parents, grandparents, and so on up
	scopeBoth        importScope = "both"
	scopeNearby      importScope = "nearby" // everyone within N relationship steps
)

type importRequest struct {
	SourceTreeID string      `json:"sourceTreeId"`
	PersonID     string      `json:"personId"`
	Scope        importScope `json:"scope"`
	Steps        int         `json:"steps"`
	DryRun       bool        `json:"dryRun"`
	// UpdateExisting refreshes people copied earlier from their originals instead of leaving them as they are.
	UpdateExisting bool `json:"updateExisting"`
}

type importPreviewPerson struct {
	ID            string     `json:"_id"`
	Name          string     `json:"name"`
	BirthDate     *time.Time `json:"birthDate"`
	DeathDate     *time.Time `json:"deathDate"`
	AlreadyInTree bool       `json:"alreadyInTree"`
}

type importResult struct {
	People   []importPreviewPerson `json:"people,omitempty"`
	Created  int                   `json:"created"`
	Reused   int                   `json:"reused"`
	Updated  int                   `json:"updated"`
	Links    int                   `json:"links"`
	RootID   string                `json:"rootId,omitempty"` // the root's id in the destination tree
	DryRun   bool                  `json:"dryRun"`
	Skipped  int                   `json:"skipped"` // people in scope the caller may not copy (branch-scoped source)
	Selected int                   `json:"selected"`
}

// selectBranch walks the graph from root according to scope, stopping after about limit people.
func selectBranch(g *treeGraph, root string, scope importScope, steps, limit int) []string {
	parents, children, partners := map[string][]string{}, map[string][]string{}, map[string][]string{}
	for _, pc := range g.ParentChild {
		parents[pc.Child] = append(parents[pc.Child], pc.Parent)
		children[pc.Parent] = append(children[pc.Parent], pc.Child)
	}
	for _, u := range g.Unions {
		partners[u.Partners[0]] = append(partners[u.Partners[0]], u.Partners[1])
		partners[u.Partners[1]] = append(partners[u.Partners[1]], u.Partners[0])
	}
	seen := map[string]struct{}{}
	order := []string{}
	add := func(id string) bool {
		if _, ok := seen[id]; ok {
			return false
		}
		seen[id] = struct{}{}
		order = append(order, id)
		return true
	}
	add(root)

	down := func() {
		line := []string{root}
		for len(line) > 0 && len(order) <= limit {
			id := line[0]
			line = line[1:]
			for _, p := range partners[id] {
				add(p)
			}
			for _, c := range children[id] {
				if add(c) {
					line = append(line, c)
				}
			}
		}
	}
	up := func() {
		line := []string{root}
		for len(line) > 0 && len(order) <= limit {
			id := line[0]
			line = line[1:]
			for _, p := range parents[id] {
				if add(p) {
					line = append(line, p)
				}
			}
		}
	}

	switch scope {
	case scopeDescendants:
		down()
	case scopeAncestors:
		up()
	case scopeBoth:
		up()
		down()
	default: // nearby
		frontier := []string{root}
		for d := 0; d < steps && len(frontier) > 0 && len(order) <= limit; d++ {
			var next []string
			for _, id := range frontier {
				for _, group := range [][]string{parents[id], children[id], partners[id]} {
					for _, n := range group {
						if add(n) {
							next = append(next, n)
						}
					}
				}
			}
			frontier = next
		}
	}
	return order
}

func importPeople(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/importPeople").End()
	var body importRequest
	if err := c.ShouldBindJSON(&body); err != nil || body.SourceTreeID == "" || body.PersonID == "" {
		responseError(c, "Invalid request body", 400)
		return
	}
	switch body.Scope {
	case scopeDescendants, scopeAncestors, scopeBoth:
	case scopeNearby:
		if body.Steps < 1 || body.Steps > 6 {
			responseError(c, "steps must be between 1 and 6", 400)
			return
		}
	default:
		responseError(c, "scope must be descendants, ancestors, both or nearby", 400)
		return
	}
	dest := currentAccess(c)
	if body.SourceTreeID == dest.TreeID {
		responseError(c, "Choose a different tree to copy from", 400)
		return
	}
	source, err := loadTreeAccess(c, body.SourceTreeID, dest.UserID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if source == nil {
		abortNotFound(c)
		return
	}
	if !source.atLeast(TreeRoleEditor) {
		responseError(c, "Only owners and editors can copy people out of a tree", 403)
		return
	}

	res, err := runImport(c, source, dest, body)
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		responseError(c, "Person not found", 404)
	case errors.Is(err, errImportRootHidden):
		responseError(c, "You can only copy people shared with you in that tree", 403)
	case errors.Is(err, errImportTooLarge):
		responseError(c, "That branch is too large to copy at once; choose a smaller scope", 413)
	case errors.Is(err, errGraphTooLarge):
		responseError(c, "The source tree is too large to copy from", 413)
	case err != nil:
		abortServerError(c, err)
	default:
		status := 201
		if body.DryRun {
			status = 200
		}
		responseSuccess(c, res, status)
	}
}

func runImport(ctx context.Context, source, dest *treeAccess, body importRequest) (*importResult, error) {
	g, err := repoGetTreeGraph(ctx, source.TreeID)
	if err != nil {
		return nil, err
	}
	live := make(map[string]struct{}, len(g.People))
	for _, p := range g.People {
		live[p.ID] = struct{}{}
	}
	if _, ok := live[body.PersonID]; !ok {
		return nil, gorm.ErrRecordNotFound
	}

	all, writable, err := source.writablePeople(ctx)
	if err != nil {
		return nil, err
	}
	allowed := func(id string) bool {
		if all {
			return true
		}
		_, ok := writable[id]
		return ok
	}
	if !allowed(body.PersonID) {
		return nil, errImportRootHidden
	}

	selected := selectBranch(g, body.PersonID, body.Scope, body.Steps, maxImportPeople)
	if len(selected) > maxImportPeople {
		return nil, errImportTooLarge
	}
	res := &importResult{DryRun: body.DryRun, Selected: len(selected)}
	ids := make([]string, 0, len(selected))
	for _, id := range selected {
		if allowed(id) {
			ids = append(ids, id)
		} else {
			res.Skipped++
		}
	}

	dbCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	db := DB.WithContext(dbCtx)

	var rows []personRow
	if err := db.Scopes(inTree(source.TreeID)).Where("id IN ?", ids).Find(&rows).Error; err != nil {
		return nil, err
	}
	byID := make(map[string]personRow, len(rows))
	for _, r := range rows {
		byID[r.ID] = r
	}

	// Copies already in the destination, keyed by their source person.
	var existing []struct {
		ID             string
		SourcePersonID string
	}
	if err := db.Model(&personRow{}).Scopes(inTree(dest.TreeID)).Select("id", "source_person_id").
		Where("source_person_id IN ?", ids).Scan(&existing).Error; err != nil {
		return nil, err
	}
	copyOf := make(map[string]string, len(ids))
	for _, e := range existing {
		copyOf[e.SourcePersonID] = e.ID
	}

	if body.DryRun {
		for _, id := range ids {
			r, ok := byID[id]
			if !ok {
				continue
			}
			_, already := copyOf[id]
			res.People = append(res.People, importPreviewPerson{ID: id, Name: r.Name, BirthDate: r.BirthDate, DeathDate: r.DeathDate, AlreadyInTree: already})
			if already {
				res.Reused++
			} else {
				res.Created++
			}
		}
		return res, nil
	}

	var rels []relationshipRow
	if err := db.Scopes(inTree(source.TreeID)).Where("from_id IN ? AND to_id IN ?", ids, ids).Find(&rels).Error; err != nil {
		return nil, err
	}

	err = DB.WithContext(dbCtx).Transaction(func(tx *gorm.DB) error {
		for _, id := range ids {
			src, ok := byID[id]
			if !ok {
				continue
			}
			if existingID, done := copyOf[id]; done {
				res.Reused++
				if body.UpdateExisting {
					if err := refreshCopy(tx, dest.TreeID, existingID, src); err != nil {
						return err
					}
					res.Updated++
				}
				continue
			}
			sourceID := src.ID
			row := personRow{
				TreeID:             dest.TreeID,
				Name:               src.Name,
				Nickname:           src.Nickname,
				Status:             src.Status,
				Gender:             src.Gender,
				BirthDate:          src.BirthDate,
				BirthDatePrecision: src.BirthDatePrecision,
				BirthDateQualifier: src.BirthDateQualifier,
				DeathDate:          src.DeathDate,
				DeathDatePrecision: src.DeathDatePrecision,
				DeathDateQualifier: src.DeathDateQualifier,
				BirthPlace:         src.BirthPlace,
				DeathPlace:         src.DeathPlace,
				Religion:           src.Religion,
				SourcePersonID:     &sourceID,
			}
			if err := tx.Omit("OwnerLinks", "Relationships").Create(&row).Error; err != nil {
				return err
			}
			if err := tx.Create(&personOwner{PersonID: row.ID, UserID: dest.UserID}).Error; err != nil {
				return err
			}
			copyOf[id] = row.ID
			res.Created++
		}
		links := make([]relationshipRow, 0, len(rels))
		for _, r := range rels {
			from, okFrom := copyOf[r.FromID]
			to, okTo := copyOf[r.ToID]
			if okFrom && okTo {
				link := relationshipRow{TreeID: dest.TreeID, FromID: from, ToID: to, Type: r.Type, SortOrder: r.SortOrder}
				link.setDetails(r.details()) // kind, partner status, marriage and end dates travel with the link
				links = append(links, link)
			}
		}
		if len(links) == 0 {
			return nil
		}
		result := tx.Omit("From", "To").Clauses(clause.OnConflict{DoNothing: true}).Create(&links)
		res.Links = int(result.RowsAffected)
		return result.Error
	})
	if err != nil {
		return nil, err
	}
	res.RootID = copyOf[body.PersonID]
	bumpTreeCache(ctx, dest.TreeID)
	return res, nil
}

// genealogyColumns are the fields a copy takes from its original (never photo, phone, address or notes).
var genealogyColumns = []string{"name", "nickname", "status", "gender", "birth_date", "birth_date_precision",
	"birth_date_qualifier", "death_date", "death_date_precision", "death_date_qualifier", "birth_place", "death_place", "religion"}

func refreshCopy(tx *gorm.DB, destTreeID, copyID string, src personRow) error {
	return tx.Model(&personRow{}).Scopes(inTree(destTreeID)).Where("id = ?", copyID).Select(genealogyColumns).
		Updates(personRow{Name: src.Name, Nickname: src.Nickname, Status: src.Status, Gender: src.Gender,
			BirthDate: src.BirthDate, BirthDatePrecision: src.BirthDatePrecision, BirthDateQualifier: src.BirthDateQualifier,
			DeathDate: src.DeathDate, DeathDatePrecision: src.DeathDatePrecision, DeathDateQualifier: src.DeathDateQualifier,
			BirthPlace: src.BirthPlace, DeathPlace: src.DeathPlace, Religion: src.Religion}).Error
}

// CopySource tells the client a person was copied from another tree. Tree details are only filled in for
// members of that tree; CanUpdate says whether "update from original" is allowed for this caller.
type CopySource struct {
	TreeID    string `json:"treeId,omitempty"`
	TreeName  string `json:"treeName,omitempty"`
	PersonID  string `json:"personId,omitempty"`
	CanUpdate bool   `json:"canUpdate"`
}

// copySourceOf resolves where a person in destTreeID was copied from, as seen by userID (nil if not a copy).
// It also returns the original's row when the caller may update from it.
func copySourceOf(ctx context.Context, destTreeID, personID, userID string) (*CopySource, *personRow, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var srcID *string
	if err := DB.WithContext(ctx).Model(&personRow{}).Scopes(inTree(destTreeID)).Select("source_person_id").
		Where("id = ?", personID).Scan(&srcID).Error; err != nil || srcID == nil {
		return nil, nil, err
	}
	out := &CopySource{}
	var src personRow
	if err := DB.WithContext(ctx).Where("id = ?", *srcID).First(&src).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return out, nil, nil // the original was deleted
	} else if err != nil {
		return nil, nil, err
	}
	access, err := loadTreeAccess(ctx, src.TreeID, userID)
	if err != nil || access == nil {
		return out, nil, err
	}
	out.TreeID, out.PersonID = src.TreeID, src.ID
	if tree, err := getTreeRepo(ctx, src.TreeID); err == nil {
		out.TreeName = tree.Name
	}
	if access.atLeast(TreeRoleEditor) {
		ok, err := access.canWritePerson(ctx, src.ID)
		if err != nil {
			return nil, nil, err
		}
		out.CanUpdate = ok
	}
	if !out.CanUpdate {
		return out, nil, nil
	}
	return out, &src, nil
}

// syncFromSource serves POST /api/trees/:treeId/people/:id/sync: copy the original's genealogy fields again.
func syncFromSource(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/syncFromSource").End()
	id := c.Param("id")
	if !requireWritePerson(c, id) {
		return
	}
	access := currentAccess(c)
	info, src, err := copySourceOf(c, access.TreeID, id, access.UserID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if info == nil {
		responseError(c, "This person was not copied from another tree", 400)
		return
	}
	if src == nil {
		responseError(c, "You can no longer update from the original", 403)
		return
	}
	if err := refreshCopy(DB.WithContext(c), access.TreeID, id, *src); err != nil {
		abortServerError(c, err)
		return
	}
	bumpTreeCache(c, access.TreeID)
	p, err := getPersonByIdRepo(c, access.TreeID, id)
	if err != nil {
		abortServerError(c, err)
		return
	}
	p.CopiedFrom = info
	responseSuccess(c, p, 200)
}
