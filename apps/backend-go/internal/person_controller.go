package app

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

func getAllPeople(c *gin.Context) {
	u, _ := c.Get("user")
	user := u.(*User)
	if user.Role == RoleAdmin {
		people, _ := repoGetAllPeople(c, nil)
		responseSuccess(c, people, 200)
		return
	}
	people, _ := repoGetAllPeople(c, []string{user.ID})
	responseSuccess(c, people, 200)
}

func getPersonById(c *gin.Context) {
	id := c.Param("id")
	p, err := getPersonByIdRepo(c, id)
	if err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	responseSuccess(c, p, 200)
}

func createPerson(c *gin.Context) {
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

	u, _ := c.Get("user")
	user := u.(*User)

	id := fmt.Sprintf("p-%d", time.Now().UnixNano())
	person := &Person{
		ID:        id,
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

	newPerson, _ := createPersonRepo(c, person)
	responseSuccess(c, newPerson, 200)
}

func updatePerson(c *gin.Context) {
	id := c.Param("id")
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

	p, err := getPersonByIdRepo(c, id)
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

	updated, _ := updatePersonRepo(c, p)
	responseSuccess(c, updated, 200)
}

func updatePersonOwnership(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Owners []string `json:"owners"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	p, err := getPersonByIdRepo(c, id)
	if err != nil {
		responseError(c, "Person not found", 404)
		return
	}

	// Update ownership for the person
	p.OwnedBy = body.Owners
	_, _ = updatePersonRepo(c, p)

	// Get all relationships for this person
	rels, err := getRelationshipsByPersonIdRepo(c, id)
	if err == nil && len(rels) > 0 {
		// Collect all spouse and child IDs
		relatedIDs := make(map[string]bool)

		for _, rel := range rels {
			// If this person is 'from' and relationship is spouse or parent (parent means they have children)
			if rel.From == id {
				if rel.Type == "spouse" || rel.Type == "parent" {
					relatedIDs[rel.To] = true
				}
			}
			// If this person is 'to' and relationship is spouse or child
			if rel.To == id {
				if rel.Type == "spouse" {
					relatedIDs[rel.From] = true
				}
				// If someone has a child relationship TO this person,
				// that means this person is the parent, so we include them as child
				if rel.Type == "child" {
					relatedIDs[rel.From] = true
				}
			}
		}

		// Update ownership for all related people
		for relatedID := range relatedIDs {
			if relatedPerson, err := getPersonByIdRepo(c, relatedID); err == nil {
				relatedPerson.OwnedBy = body.Owners
				_, _ = updatePersonRepo(c, relatedPerson)
			}
		}
	}

	responseSuccess(c, true, 200)
}

func deletePersonById(c *gin.Context) {
	id := c.Param("id")
	p, err := deletePersonRepo(c, id)
	if err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	responseSuccess(c, p, 200)
}
