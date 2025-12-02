package app

import (
	"github.com/gin-gonic/gin"
)

func getRelationships(c *gin.Context) {
	id := c.Param("id")
	rels, err := getRelationshipsByPersonIdRepo(c, id)
	if err != nil {
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
	id := c.Param("id")
	// implement upsert similar to Node: build inserts and updates
	existing, err := getRelationshipsByPersonIdRepo(c, id)
	if err != nil {
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
		from := id
		if rel.From != nil && *rel.From != "" {
			from = *rel.From
		}
		if ex, ok := existingMap[key]; !ok {
			toInsert = append(toInsert, Relationship{From: from, To: rel.To, Type: rel.Type, Order: order})
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

	if len(toInsert) > 0 {
		if err := insertManyRelationshipsRepo(c, toInsert); err != nil {
			responseError(c, "Failed to insert relationships", 500)
			return
		}
	}
	for _, up := range toUpdate {
		if _, err := updateRelationshipRepo(c, up); err != nil {
			responseError(c, "Failed to update relationships", 500)
			return
		}
	}
	if len(toDelete) > 0 {
		if err := deleteRelationshipsRepo(c, toDelete); err != nil {
			responseError(c, "Failed to delete relationships", 500)
			return
		}
	}

	responseSuccess(c, gin.H{"inserted": len(toInsert), "updated": len(toUpdate), "deleted": len(toDelete)}, 201)
}
