package app

import (
	"github.com/gin-gonic/gin"
)

var anyRole = []string{string(RoleAdmin), string(RoleUser)}

func RegisterRoutes(rg *gin.Engine) {
	api := rg.Group("/api")
	signedIn := authenticate(anyRole)

	// Tree workspaces. Every data route below is scoped to :treeId and requires membership;
	// non-members get 404. Handlers apply the per-person/family rules from access.go.
	trees := api.Group("/trees", signedIn)
	{
		trees.GET("", listTrees)
		trees.POST("", createTree)

		member := withTree(treeFromParam, TreeRoleViewer)
		editor := withTree(treeFromParam, TreeRoleEditor)
		owner := withTree(treeFromParam, TreeRoleOwner)

		trees.GET("/:treeId", member, getTree)
		trees.PATCH("/:treeId", owner, updateTree)
		trees.DELETE("/:treeId", owner, deleteTree)

		trees.GET("/:treeId/members", member, listMembers)
		trees.PATCH("/:treeId/members/:userId", owner, updateMember)
		trees.DELETE("/:treeId/members/:userId", member, removeMember)

		trees.GET("/:treeId/invites", owner, listInvites)
		trees.POST("/:treeId/invites", owner, createInvite)
		trees.DELETE("/:treeId/invites/:inviteId", owner, revokeInvite)

		trees.GET("/:treeId/people", member, getAllPeople)
		trees.POST("/:treeId/people", editor, createPerson)
		trees.GET("/:treeId/people/:id", member, getPersonById)
		trees.PUT("/:treeId/people/:id", editor, updatePerson)
		trees.DELETE("/:treeId/people/:id", editor, deletePersonById)
		trees.PUT("/:treeId/people/:id/ownership", owner, updatePersonOwnership)
		trees.GET("/:treeId/people/:id/relationships", member, getRelationships)
		trees.POST("/:treeId/people/:id/relationships", editor, crudRelationships)
		trees.GET("/:treeId/people/:id/tree", member, getFamilyTree)

		trees.GET("/:treeId/families", member, getFamilies)
		trees.POST("/:treeId/families", editor, createFamily)
		trees.DELETE("/:treeId/families/:id", editor, deleteFamily)
	}
	api.POST("/invites/accept", signedIn, acceptInvite)

	// Legacy routes used by the current frontend. They resolve the tree from the addressed person/family
	// (or the caller's first tree for lists and creates) and run the same handlers and checks.
	api.GET("/tree/:id", signedIn, withTree(treeFromPerson("id"), TreeRoleViewer), getFamilyTree)

	person := api.Group("/person", signedIn)
	{
		person.GET("", withTree(treeFromDefault, TreeRoleViewer), getAllPeople)
		person.POST("", withTree(treeFromDefault, TreeRoleEditor), createPerson)
		person.GET("/:id", withTree(treeFromPerson("id"), TreeRoleViewer), getPersonById)
		person.PUT("/:id", withTree(treeFromPerson("id"), TreeRoleEditor), updatePerson)
		person.DELETE("/:id", withTree(treeFromPerson("id"), TreeRoleEditor), deletePersonById)
		person.PUT("/:id/ownership", withTree(treeFromPerson("id"), TreeRoleOwner), updatePersonOwnership)
	}

	family := api.Group("/family", signedIn)
	{
		family.GET("", withTree(treeFromDefault, TreeRoleViewer), getFamilies)
		family.POST("", withTree(treeFromDefault, TreeRoleEditor), createFamily)
		family.DELETE("/:id", withTree(treeFromFamily("id"), TreeRoleEditor), deleteFamily)
	}

	rel := api.Group("/relationship", signedIn)
	{
		rel.GET("/:id", withTree(treeFromPerson("id"), TreeRoleViewer), getRelationships)
		rel.POST("/:id", withTree(treeFromPerson("id"), TreeRoleEditor), crudRelationships)
	}

	auth := api.Group("/auth")
	{
		auth.POST("/signin", signIn)
		auth.POST("", authenticate([]string{string(RoleAdmin)}), createUser)
		auth.GET("", signedIn, profile)
		auth.GET("/users", signedIn, withTree(treeFromDefault, TreeRoleOwner), users)
	}
}
