package app

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// getFamilies lists the tree's families; editors and viewers of a branch-scoped tree only see their own.
func getFamilies(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getFamilies").End()
	access := currentAccess(c)
	families, err := getAllFamiliesRepo(c, access.TreeID, access.listOwnerFilter())
	if err != nil {
		abortServerError(c, err)
		return
	}
	responseSuccess(c, families, 200)
}

func createFamily(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/createFamily").End()
	var body struct {
		Name   string `json:"name"`
		Person string `json:"person"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	access := currentAccess(c)
	// ensure person exists in this tree and the caller may change them
	person, err := getPersonByIdRepo(c, access.TreeID, body.Person)
	if err != nil {
		responseError(c, "Person not found", 400)
		return
	}
	if !requireWritePerson(c, person.ID) {
		return
	}
	f := &Family{TreeID: access.TreeID, Name: body.Name, Person: person, OwnedBy: []string{currentUser(c).ID}}
	newF, err := createFamilyRepo(c, f)
	if err != nil {
		newrelic.FromContext(c.Request.Context()).NoticeError(err)
		responseError(c, "Failed to create family", 500)
		return
	}
	responseSuccess(c, newF, 201)
}

// renameFamily serves PATCH /api/trees/:treeId/families/:id {name}.
func renameFamily(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/renameFamily").End()
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	name, ok := validFamilyName(body.Name)
	if !ok {
		responseError(c, fmt.Sprintf("Family name is required (max %d characters)", maxFamilyNameLength), 400)
		return
	}
	id := c.Param("id")
	access := currentAccess(c)
	ok, err := access.canWriteFamily(c, id)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if !ok {
		responseError(c, "Forbidden", 403)
		return
	}
	f, err := renameFamilyRepo(c, access.TreeID, id, name)
	if err != nil {
		responseError(c, "Family not found", 404)
		return
	}
	responseSuccess(c, f, 200)
}

const maxFamilyNameLength = 120

func validFamilyName(s string) (string, bool) {
	s = strings.TrimSpace(s)
	return s, s != "" && utf8.RuneCountInString(s) <= maxFamilyNameLength
}

func deleteFamily(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/deleteFamily").End()
	id := c.Param("id")
	access := currentAccess(c)
	ok, err := access.canWriteFamily(c, id)
	if err != nil {
		abortServerError(c, err)
		return
	}
	if !ok {
		responseError(c, "Forbidden", 403)
		return
	}
	f, err := deleteFamilyRepo(c, access.TreeID, id)
	if err != nil {
		responseError(c, "Family not found", 404)
		return
	}
	responseSuccess(c, f, 200)
}
