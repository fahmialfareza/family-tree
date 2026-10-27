package app

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
	"gorm.io/gorm"
)

func getRelationships(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getRelationships").End()
	id := c.Param("id")
	treeID := currentAccess(c).TreeID
	if _, err := getPersonByIdRepo(c, treeID, id); err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	rels, err := getRelationshipsByPersonIdRepo(c, treeID, id)
	if err != nil {
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		responseError(c, "Failed to fetch relationships", 500)
		return
	}

	// Filter to return only relationships where from === personId (matching Node.js behavior)
	filteredRels := []*Relationship{}
	for _, rel := range rels {
		if rel.From == id {
			filteredRels = append(filteredRels, rel)
		}
	}

	responseSuccess(c, filteredRels, 200)
}

// crudRelationships replaces the relationships of :id with the body: [{to, type, order, kind, status, startDate,
// startDateQualifier, startPlace, endDate, endDateQualifier}]. Every relationship is stored as a pair (parent/child,
// spouse/spouse), and both rows get the same order and details (kind for parents and children; status, marriage
// and end dates for partners; see relationship_details.go). All changes are written in one transaction.
func crudRelationships(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/crudRelationships").End()
	// "from" is accepted for backwards compatibility but ignored: relationships are always written for :id.
	var body []struct {
		From  *string `json:"from"`
		To    string  `json:"to"`
		Order *int    `json:"order"`
		Type  string  `json:"type"`
		ID    *string `json:"_id"`
		relationshipDetailsInput
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	details := make([]RelationshipDetails, len(body))
	for i, rel := range body {
		if rel.Type != "" && rel.Type != "parent" && rel.Type != "child" && rel.Type != "spouse" {
			responseError(c, "Relationship type must be parent, child or spouse", 400)
			return
		}
		d, msg := rel.relationshipDetailsInput.details(rel.Type)
		if msg != "" {
			responseError(c, msg, 400)
			return
		}
		details[i] = d
	}
	id := c.Param("id")
	treeID := currentAccess(c).TreeID
	if _, err := getPersonByIdRepo(c, treeID, id); err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	if !requireWritePerson(c, id) {
		return
	}
	existing, err := getRelationshipsByPersonIdRepo(c, treeID, id)
	if err != nil {
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		responseError(c, "Failed to fetch relationships", 500)
		return
	}
	existingMap := map[string]Relationship{}
	for _, r := range existing {
		existingMap[r.From+"_"+r.To+"_"+r.Type] = *r
	}

	toInsert := []Relationship{}
	toUpdate := []Relationship{}
	seenKeys := map[string]bool{}
	// upsert writes one row of a pair: inserted when missing, updated when its order or details changed.
	upsert := func(from, to, relType string, order int, d RelationshipDetails) {
		key := from + "_" + to + "_" + relType
		if seenKeys[key] {
			return
		}
		seenKeys[key] = true
		ex, ok := existingMap[key]
		if !ok {
			toInsert = append(toInsert, Relationship{From: from, To: to, Type: relType, Order: order, RelationshipDetails: d})
			return
		}
		if ex.Order != order || !ex.RelationshipDetails.equal(d) {
			ex.Order, ex.RelationshipDetails = order, d
			ex.FromDetails, ex.ToDetails = nil, nil
			toUpdate = append(toUpdate, ex)
		}
	}
	inverse := map[string]string{"parent": "child", "child": "parent", "spouse": "spouse"}
	for i, rel := range body {
		if rel.To == "" || rel.Type == "" {
			continue
		}
		order := 0
		if rel.Order != nil {
			order = *rel.Order
		}
		upsert(id, rel.To, rel.Type, order, details[i])
		upsert(rel.To, id, inverse[rel.Type], order, details[i])
	}

	// delete those not seen
	toDelete := []string{}
	for _, ex := range existing {
		key := ex.From + "_" + ex.To + "_" + ex.Type
		if !seenKeys[key] {
			toDelete = append(toDelete, ex.ID)
		}
	}

	// Every relationship is stored on both people, so the caller must be allowed to change the other side
	// too; otherwise a branch-scoped editor could rewire people outside their branch.
	// Every link in the request counts, changed or not: re-saving a link to someone outside the caller's
	// branch is refused too (see TestBranchScopedEditor).
	touched := []string{}
	for _, rel := range body {
		if rel.To != "" && rel.Type != "" {
			touched = append(touched, id, rel.To)
		}
	}
	for _, r := range toInsert {
		touched = append(touched, r.From, r.To)
	}
	for _, r := range toUpdate {
		touched = append(touched, r.From, r.To)
	}
	deleteSet := map[string]struct{}{}
	for _, d := range toDelete {
		deleteSet[d] = struct{}{}
	}
	for _, ex := range existing {
		if _, ok := deleteSet[ex.ID]; ok {
			touched = append(touched, ex.From, ex.To)
		}
	}
	allowed, err := currentAccess(c).canWritePeople(c, touched)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if !allowed {
		responseError(c, "Forbidden", 403)
		return
	}

	if err := saveRelationshipChangesRepo(c, treeID, toInsert, toUpdate, toDelete); err != nil {
		if errors.Is(err, errCrossTree) || errors.Is(err, gorm.ErrRecordNotFound) {
			responseError(c, "Related person not found in this tree", 400)
			return
		}
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		responseError(c, "Failed to save relationships", 500)
		return
	}

	responseSuccess(c, gin.H{"inserted": len(toInsert), "updated": len(toUpdate), "deleted": len(toDelete)}, 201)
}
