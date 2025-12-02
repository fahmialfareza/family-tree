package app

import (
	"github.com/gin-gonic/gin"
)

func RegisterRoutes(rg *gin.Engine) {
	// temporary helper: list registered routes for debugging
	rg.GET("/routes", func(c *gin.Context) {
		c.JSON(200, gin.H{"routes": rg.Routes()})
	})
	api := rg.Group("/api")
	{
		api.GET("/tree/:personId", authenticate([]string{"user", "admin"}), getFamilyTree)

		person := api.Group("/person")
		{
			person.GET("", authenticate([]string{"admin", "user"}), getAllPeople)
			person.POST("", authenticate([]string{"admin", "user"}), createPerson)
			person.GET("/:id", authenticate([]string{"admin", "user"}), getPersonById)
			person.PUT("/:id", authenticate([]string{"admin", "user"}), updatePerson)
			person.DELETE("/:id", authenticate([]string{"admin", "user"}), deletePersonById)
			person.PUT("/:id/ownership", authenticate([]string{"admin"}), updatePersonOwnership)
		}

		family := api.Group("/family")
		{
			family.GET("", authenticate([]string{"admin", "user"}), getFamilies)
			family.POST("", authenticate([]string{"admin", "user"}), createFamily)
			family.DELETE("/:id", authenticate([]string{"admin", "user"}), deleteFamily)
		}

		rel := api.Group("/relationship")
		{
			rel.GET("/:id", authenticate([]string{"admin", "user"}), getRelationships)
			rel.POST("/:id", authenticate([]string{"admin", "user"}), crudRelationships)
		}

		auth := api.Group("/auth")
		{
			auth.POST("/signin", signIn)
			auth.POST("", authenticate([]string{"admin"}), createUser)
			auth.GET("", authenticate([]string{"admin", "user"}), profile)
			auth.GET("/users", authenticate([]string{"admin"}), users)
		}
	}
}
