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

func crudRelationships(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/crudRelationships").End()
	// "from" is accepted for backwards compatibility but ignored: relationships are always written for :id.
	var body []struct {
		From  *string `json:"from"`
		To    string  `json:"to"`
		Order *int    `json:"order"`
		Type  string  `json:"type"`
		ID    *string `json:"_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	for _, rel := range body {
		if rel.Type != "" && rel.Type != "parent" && rel.Type != "child" && rel.Type != "spouse" {
			responseError(c, "Relationship type must be parent, child or spouse", 400)
			return
		}
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
	// implement upsert similar to Node: build inserts and updates
	existing, err := getRelationshipsByPersonIdRepo(c, treeID, id)
	if err != nil {
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		responseError(c, "Failed to fetch relationships", 500)
		return
	}
	existingMap := map[string]Relationship{}
	for _, r := range existing {
		key := r.From + "_" + r.To + "_" + r.Type
		existingMap[key] = *r
	}

	toInsert := []Relationship{}
	toUpdate := []Relationship{}
	seenKeys := map[string]bool{}

	for _, rel := range body {
		if rel.To == "" || rel.Type == "" {
			continue
		}
		key := id + "_" + rel.To + "_" + rel.Type
		seenKeys[key] = true
		order := 0
		if rel.Order != nil {
			order = *rel.Order
		}
		if ex, ok := existingMap[key]; !ok {
			toInsert = append(toInsert, Relationship{From: id, To: rel.To, Type: rel.Type, Order: order})
		} else {
			if ex.Order != order {
				ex.Order = order
				toUpdate = append(toUpdate, ex)
			}
		}

		// inverse
		invType := ""
		if rel.Type == "parent" {
			invType = "child"
		} else if rel.Type == "child" {
			invType = "parent"
		} else if rel.Type == "spouse" {
			invType = "spouse"
		}
		if invType != "" {
			invKey := rel.To + "_" + id + "_" + invType
			seenKeys[invKey] = true
			if ex, ok := existingMap[invKey]; !ok {
				toInsert = append(toInsert, Relationship{From: rel.To, To: id, Type: invType, Order: order})
			} else {
				ex.Order = order
				toUpdate = append(toUpdate, ex)
			}
		}
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
	touched := []string{}
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

	if len(toInsert) > 0 {
		if err := insertManyRelationshipsRepo(c, treeID, toInsert); err != nil {
			if errors.Is(err, errCrossTree) || errors.Is(err, gorm.ErrRecordNotFound) {
				responseError(c, "Related person not found in this tree", 400)
				return
			}
			newrelic.FromContext(c.Request.Context()).NoticeError(err)
			responseError(c, "Failed to insert relationships", 500)
			return
		}
	}
	for _, up := range toUpdate {
		if _, err := updateRelationshipRepo(c, treeID, up); err != nil {
			newrelic.FromContext(c.Request.Context()).NoticeError(err)
			responseError(c, "Failed to update relationships", 500)
			return
		}
	}
	if len(toDelete) > 0 {
		if err := deleteRelationshipsRepo(c, treeID, toDelete); err != nil {
			newrelic.FromContext(c.Request.Context()).NoticeError(err)
			responseError(c, "Failed to delete relationships", 500)
			return
		}
	}

	responseSuccess(c, gin.H{"inserted": len(toInsert), "updated": len(toUpdate), "deleted": len(toDelete)}, 201)
}
