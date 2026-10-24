package app

import (
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// getAllPeople lists the tree's people; editors and viewers of a branch-scoped tree only see their own branch.
func getAllPeople(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getAllPeople").End()
	access := currentAccess(c)
	if _, paged := c.GetQuery("limit"); paged {
		getPeoplePage(c, access)
		return
	}
	people, err := repoGetAllPeople(c, access.TreeID, access.listOwnerFilter())
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, people, 200)
}

const maxPeoplePageSize = 200

// getPeoplePage serves ?limit=1..200[&cursor=...][&q=...]: {items, nextCursor} in (created_at, id) order.
func getPeoplePage(c *gin.Context, access *treeAccess) {
	limit, err := strconv.Atoi(c.Query("limit"))
	if err != nil || limit < 1 || limit > maxPeoplePageSize {
		responseError(c, fmt.Sprintf("limit must be between 1 and %d", maxPeoplePageSize), 400)
		return
	}
	var after *peopleCursor
	if raw := c.Query("cursor"); raw != "" {
		if after, err = decodePeopleCursor(raw); err != nil {
			responseError(c, "Invalid cursor", 400)
			return
		}
	}
	q := strings.TrimSpace(c.Query("q"))
	if tooLong(q, maxPersonNameLength) {
		responseError(c, "Search query is too long", 400)
		return
	}
	items, next, err := repoGetPeoplePage(c, access.TreeID, access.listOwnerFilter(), limit, after, q)
	if err != nil {
		abortServerError(c, err)
		return
	}
	var nextCursor *string
	if next != nil {
		s := next.encode()
		nextCursor = &s
	}
	responseSuccess(c, gin.H{"items": items, "nextCursor": nextCursor}, 200)
}

func getPersonById(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getPersonById").End()
	id := c.Param("id")
	p, err := getPersonByIdRepo(c, currentAccess(c).TreeID, id)
	if err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	responseSuccess(c, p, 200)
}

func createPerson(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/createPerson").End()
	person := &Person{TreeID: currentAccess(c).TreeID, OwnedBy: []string{currentUser(c).ID}}
	if msg := bindPersonForm(c, person, true); msg != "" {
		responseError(c, msg, 400)
		return
	}
	photoURL, ok := receivePhoto(c)
	if !ok {
		return
	}
	person.PhotoURL = photoURL

	newPerson, err := createPersonRepo(c, person)
	if err != nil {
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		responseError(c, "Failed to create person", 500)
		return
	}
	responseSuccess(c, newPerson, 200)
}

func updatePerson(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/updatePerson").End()
	id := c.Param("id")
	if !requireWritePerson(c, id) {
		return
	}
	p, err := getPersonByIdRepo(c, currentAccess(c).TreeID, id)
	if err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	if msg := bindPersonForm(c, p, false); msg != "" {
		responseError(c, msg, 400)
		return
	}
	photoURL, ok := receivePhoto(c)
	if !ok {
		return
	}
	if photoURL != "" {
		p.PhotoURL = photoURL
	}

	updated, err := updatePersonRepo(c, p)
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, updated, 200)
}

// receivePhoto uploads the optional "photo" file. It returns "" when none was sent, and false after
// writing an error response.
func receivePhoto(c *gin.Context) (string, bool) {
	if file, err := c.FormFile("photo"); err != nil || file == nil {
		return "", true
	}
	url, err := uploadImage(c, "photo")
	if err != nil {
		var uerr *uploadError
		if errors.As(err, &uerr) {
			responseError(c, uerr.message, uerr.status)
			return "", false
		}
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		slog.ErrorContext(c, "photo upload failed", "request_id", requestID(c), "error", err)
		responseError(c, "Failed to upload photo", 500)
		return "", false
	}
	return url, true
}

func updatePersonOwnership(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/updatePersonOwnership").End()
	id := c.Param("id")
	var body struct {
		Owners []string `json:"owners"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	access := currentAccess(c)
	members, err := areMembers(c, access.TreeID, body.Owners)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if !members {
		responseError(c, "Owners must be members of this tree", 400)
		return
	}
	if _, err := getPersonByIdRepo(c, access.TreeID, id); err != nil {
		responseError(c, "Person not found", 404)
		return
	}

	// Update ownership for the person
	if err := updateOwnedByBatchRepo(c, access.TreeID, []string{id}, body.Owners); err != nil {
		abortServerError(c, err)
		return
	}

	// Get all relationships for this person and batch-update ownership for related people.
	rels, err := getRelationshipsByPersonIdRepo(c, access.TreeID, id)
	if err == nil && len(rels) > 0 {
		relatedIDs := make(map[string]struct{})
		for _, rel := range rels {
			if rel.From == id && (rel.Type == "spouse" || rel.Type == "parent") {
				relatedIDs[rel.To] = struct{}{}
			}
			if rel.To == id && (rel.Type == "spouse" || rel.Type == "child") {
				relatedIDs[rel.From] = struct{}{}
			}
		}

		if len(relatedIDs) > 0 {
			ids := make([]string, 0, len(relatedIDs))
			for rid := range relatedIDs {
				ids = append(ids, rid)
			}
			if err := updateOwnedByBatchRepo(c, access.TreeID, ids, body.Owners); err != nil {
				abortServerError(c, err)
				return
			}
		}
	}

	responseSuccess(c, true, 200)
}

func deletePersonById(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/deletePersonById").End()
	id := c.Param("id")
	if !requireWritePerson(c, id) {
		return
	}
	p, err := deletePersonRepo(c, currentAccess(c).TreeID, id)
	if err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	responseSuccess(c, p, 200)
}
