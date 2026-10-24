package app

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// getAllPeople lists the tree's people; editors and viewers of a branch-scoped tree only see their own branch.
func getAllPeople(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getAllPeople").End()
	access := currentAccess(c)
	people, err := repoGetAllPeople(c, access.TreeID, access.listOwnerFilter())
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, people, 200)
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
	// accept multipart/form-data or json
	name := c.PostForm("name")
	nickname := c.PostForm("nickname")
	address := c.PostForm("address")
	status := c.PostForm("status")
	gender := c.PostForm("gender")
	birthDateStr := c.PostForm("birthDate")
	phone := c.PostForm("phone")

	if name == "" || nickname == "" || address == "" || (status != "alive" && status != "deceased") || (gender != "male" && gender != "female") {
		responseError(c, "Invalid request body", 400)
		return
	}

	var birthDate time.Time
	if birthDateStr != "" {
		t, err := time.Parse(time.RFC3339, birthDateStr)
		if err != nil {
			// try parse date only
			t2, err2 := time.Parse("2006-01-02", birthDateStr)
			if err2 != nil {
				responseError(c, "Invalid birth date", 400)
				return
			}
			birthDate = t2
		} else {
			birthDate = t
		}
	}

	var photoURL string
	file, err := c.FormFile("photo")
	if err == nil && file != nil {
		url, err := uploadImage(c, "photo")
		if err != nil {
			fmt.Printf("[ERROR] createPerson - Failed to upload photo: %v\n", err)
			responseError(c, fmt.Sprintf("Failed to upload photo: %v", err), 500)
			return
		}
		photoURL = url
	}

	user := currentUser(c)

	id := fmt.Sprintf("p-%d", time.Now().UnixNano())
	person := &Person{
		ID:        id,
		TreeID:    currentAccess(c).TreeID,
		Name:      name,
		Nickname:  nickname,
		Address:   address,
		Status:    status,
		Gender:    gender,
		BirthDate: birthDate,
		Phone:     phone,
		PhotoURL:  photoURL,
		OwnedBy:   []string{user.ID},
	}

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
	name := c.PostForm("name")
	nickname := c.PostForm("nickname")
	address := c.PostForm("address")
	status := c.PostForm("status")
	gender := c.PostForm("gender")
	birthDateStr := c.PostForm("birthDate")
	phone := c.PostForm("phone")

	if name == "" || nickname == "" || address == "" || (status != "alive" && status != "deceased") || (gender != "male" && gender != "female") {
		responseError(c, "Invalid request body", 400)
		return
	}

	var birthDate time.Time
	if birthDateStr != "" {
		t, err := time.Parse(time.RFC3339, birthDateStr)
		if err != nil {
			t2, err2 := time.Parse("2006-01-02", birthDateStr)
			if err2 != nil {
				responseError(c, "Invalid birth date", 400)
				return
			}
			birthDate = t2
		} else {
			birthDate = t
		}
	}

	p, err := getPersonByIdRepo(c, currentAccess(c).TreeID, id)
	if err != nil {
		responseError(c, "Person not found", 404)
		return
	}

	var photoURL string
	file, err := c.FormFile("photo")
	if err == nil && file != nil {
		url, err := uploadImage(c, "photo")
		if err != nil {
			fmt.Printf("[ERROR] updatePerson - Failed to upload photo: %v\n", err)
			responseError(c, fmt.Sprintf("Failed to upload photo: %v", err), 500)
			return
		}
		photoURL = url
	}

	p.Name = name
	p.Nickname = nickname
	p.Address = address
	p.Status = status
	p.Gender = gender
	p.BirthDate = birthDate
	p.Phone = phone
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
