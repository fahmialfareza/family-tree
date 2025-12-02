package app

import (
	"github.com/gin-gonic/gin"
)

func getFamilies(c *gin.Context) {
	u, _ := c.Get("user")
	user := u.(*User)
	if user.Role == RoleUser {
		families, _ := getAllFamiliesRepo(c, []string{user.ID})
		responseSuccess(c, families, 200)
		return
	}
	families, _ := getAllFamiliesRepo(c, nil)
	responseSuccess(c, families, 200)
}

func createFamily(c *gin.Context) {
	var body struct {
		Name   string `json:"name"`
		Person string `json:"person"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		responseError(c, "Invalid request body", 400)
		return
	}
	// ensure person exists
	person, err := getPersonByIdRepo(c, body.Person)
	if err != nil {
		responseError(c, "Person not found", 400)
		return
	}
	u, _ := c.Get("user")
	user := u.(*User)
	f := &Family{Name: body.Name, Person: person, OwnedBy: []string{user.ID}}
	newF, _ := createFamilyRepo(c, f)
	responseSuccess(c, newF, 201)
}

func deleteFamily(c *gin.Context) {
	id := c.Param("id")
	f, err := deleteFamilyRepo(c, id)
	if err != nil {
		responseError(c, "Family not found", 404)
		return
	}
	responseSuccess(c, f, 200)
}
