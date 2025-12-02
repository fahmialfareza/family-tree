package app

import (
	"context"
	"fmt"
	"os"

	"github.com/gin-gonic/gin"
)

type FamilyTreeNode struct {
	ID         string                 `json:"_id,omitempty"`
	Name       string                 `json:"name,omitempty"`
	Gender     string                 `json:"gender,omitempty"`
	Attributes map[string]interface{} `json:"attributes,omitempty"`
	Children   []FamilyTreeNode       `json:"children,omitempty"`
}

// filterAttributes removes null and empty values from attributes map
func filterAttributes(attrs map[string]interface{}) map[string]interface{} {
	if attrs == nil {
		return map[string]interface{}{}
	}
	filtered := map[string]interface{}{}
	for k, v := range attrs {
		if v != nil && v != "" {
			filtered[k] = v
		}
	}
	return filtered
}

// internalNode mirrors the intermediate structure used by the Node.js implementation
// it can include spouses and parents arrays which are then transformed to the D3 shape.
type internalNode struct {
	ID         string                 `json:"_id,omitempty"`
	Name       string                 `json:"name,omitempty"`
	Gender     string                 `json:"gender,omitempty"`
	Attributes map[string]interface{} `json:"attributes,omitempty"`
	Children   []internalNode         `json:"children,omitempty"`
	Spouses    []internalNode         `json:"spouses,omitempty"`
	Parents    []internalNode         `json:"parents,omitempty"`
}

func getFamilyTree(c *gin.Context) {
	personId := c.Param("personId")
	mode := c.Query("mode")
	// Default to "parent" mode if not specified (matching Node.js)
	if mode == "" {
		mode = "parent"
	}
	// unconditional handler-level log to confirm invocation
	fmt.Printf("[TREE] handler invoked person=%s mode=%s\n", personId, mode)
	ctx := c.Request.Context()
	// Match Node.js logic: mode=="parent" shows children, mode=="child" shows parents
	withChildren := mode == "parent"
	withParent := mode == "child"
	inode, err := buildFamilyTree(ctx, personId, withChildren, withParent)
	if err != nil {
		responseError(c, "Failed to build family tree", 500)
		return
	}
	// transform internal node into D3-friendly structure (exact logic ported from Node)
	d3 := transformToD3Tree(inode)

	// Apply transformToCoupleTree only when showing children (mode=parent creates couple nodes)
	// When showing parents (mode=child), return D3 tree directly since couple transformation filters out parents
	var result interface{}
	if withChildren {
		result = transformToCoupleTree(d3)
	} else {
		result = []FamilyTreeNode{d3}
	}

	responseSuccess(c, result, 200)
}

func buildFamilyTree(ctx context.Context, personId string, withChildren bool, withParent bool) (internalNode, error) {
	person, err := getPersonByIdRepo(ctx, personId)
	if err != nil {
		return internalNode{}, err
	}
	// relationships are fetched per-node inside the recursive builder

	// helper to recursively build node
	var build func(id string, wc bool, wp bool) (internalNode, error)
	build = func(id string, wc bool, wp bool) (internalNode, error) {
		p, err := getPersonByIdRepo(ctx, id)
		if err != nil {
			return internalNode{}, err
		}
		debug := os.Getenv("TREE_DEBUG") == "1"
		// fetch relationships for this node (important: per-node relationships)
		rels, err := getRelationshipsByPersonIdRepo(ctx, id)
		if err != nil {
			rels = []*Relationship{}
		}
		if debug {
			fmt.Printf("[TREE] node=%s rels=%d wc=%v wp=%v\n", id, len(rels), wc, wp)
		}
		node := internalNode{
			ID:     p.ID,
			Name:   p.Nickname,
			Gender: p.Gender,
			Attributes: map[string]interface{}{
				"gender": p.Gender,
			},
			Children: []internalNode{},
			Spouses:  []internalNode{},
			Parents:  []internalNode{},
		}

		if wc {
			// find spouse ids
			spouseSet := map[string]struct{}{}
			for _, rel := range rels {
				if rel.Type == "spouse" {
					if rel.From == id {
						spouseSet[rel.To] = struct{}{}
					} else if rel.To == id {
						spouseSet[rel.From] = struct{}{}
					}
				}
			}

			// get my children ids
			myChildrenSet := map[string]struct{}{}
			for _, rel := range rels {
				if rel.Type == "parent" && rel.From == id {
					myChildrenSet[rel.To] = struct{}{}
				}
			}

			// For each spouse, find shared children and build spouse nodes
			sharedChildrenSet := map[string]struct{}{}
			spouseNodes := []internalNode{}
			for spouseId := range spouseSet {
				spouseRels, _ := getRelationshipsByPersonIdRepo(ctx, spouseId)
				spouseChildrenSet := map[string]struct{}{}
				for _, srel := range spouseRels {
					if srel.Type == "parent" && srel.From == spouseId {
						spouseChildrenSet[srel.To] = struct{}{}
					}
				}

				sharedChildrenIds := []string{}
				for cid := range myChildrenSet {
					if _, ok := spouseChildrenSet[cid]; ok {
						sharedChildrenIds = append(sharedChildrenIds, cid)
						sharedChildrenSet[cid] = struct{}{}
					}
				}

				children := []internalNode{}
				for _, childId := range sharedChildrenIds {
					childNode, err := build(childId, true, false)
					if err == nil {
						if debug {
							fmt.Printf("[TREE]  node=%s spouse=%s child=%s found\n", id, spouseId, childId)
						}
						children = append(children, childNode)
					}
				}

				sp, err := getPersonByIdRepo(ctx, spouseId)
				if err == nil {
					if debug {
						fmt.Printf("[TREE]  spouse node=%s has %d children\n", spouseId, len(children))
					}
					spouseNodes = append(spouseNodes, internalNode{
						ID:       sp.ID,
						Name:     sp.Nickname,
						Gender:   sp.Gender,
						Children: children,
					})
				}
			}

			// children not associated with any spouse
			singleChildren := []internalNode{}
			for cid := range myChildrenSet {
				if _, ok := sharedChildrenSet[cid]; !ok {
					childNode, err := build(cid, true, false)
					if err == nil {
						if debug {
							fmt.Printf("[TREE]  node=%s singleChild=%s found\n", id, cid)
						}
						singleChildren = append(singleChildren, childNode)
					}
				}
			}

			// assemble children: single children first, then spouse entries stored on Spouses
			for _, sc := range singleChildren {
				node.Children = append(node.Children, sc)
			}
			for _, spNode := range spouseNodes {
				node.Spouses = append(node.Spouses, spNode)
			}
		}

		if wp {
			// find parents (relationships where type==parent and rel.to == id)
			parentIdsSet := map[string]struct{}{}
			// find parents using relationships for this node
			for _, rel := range rels {
				if rel.Type == "parent" && rel.To == id {
					parentIdsSet[rel.From] = struct{}{}
				}
			}
			parents := []internalNode{}
			for pid := range parentIdsSet {
				parentNode, err := build(pid, false, true)
				if err == nil {
					if debug {
						fmt.Printf("[TREE]  node=%s parent=%s found\n", id, pid)
					}
					parents = append(parents, parentNode)
				}
			}
			node.Parents = append(node.Parents, parents...)
		}

		return node, nil
	}

	// kick off based on flags
	if withChildren {
		return build(personId, true, false)
	}
	if withParent {
		return build(personId, false, true)
	}
	// default: return basic internal node
	return internalNode{
		ID:       person.ID,
		Name:     person.Nickname,
		Gender:   person.Gender,
		Children: []internalNode{},
	}, nil
}

// transformToD3Tree converts the intermediate internalNode into the D3-friendly node
func transformToD3Tree(person internalNode) FamilyTreeNode {
	node := FamilyTreeNode{
		Name:       person.Name,
		ID:         person.ID,
		Gender:     person.Gender,
		Attributes: filterAttributes(person.Attributes),
		Children:   []FamilyTreeNode{},
	}

	// children
	for _, ch := range person.Children {
		node.Children = append(node.Children, transformToD3Tree(ch))
	}

	// spouses -> push nodes; when spouse has children, gender set to "male" in original code when children exist
	for _, sp := range person.Spouses {
		if len(sp.Children) > 0 {
			// spouse node with children
			var children []FamilyTreeNode
			for _, c := range sp.Children {
				children = append(children, transformToD3Tree(c))
			}
			node.Children = append(node.Children, FamilyTreeNode{
				Name: sp.Name,
				Attributes: filterAttributes(map[string]interface{}{
					"relation": "spouse",
					"gender":   sp.Gender,
				}),
				ID:       sp.ID,
				Children: children,
				Gender:   sp.Gender,
			})
		} else {
			node.Children = append(node.Children, FamilyTreeNode{
				Name: sp.Name,
				Attributes: filterAttributes(map[string]interface{}{
					"relation": "spouse",
					"gender":   sp.Gender,
				}),
				ID:       sp.ID,
				Children: []FamilyTreeNode{},
				Gender:   sp.Gender,
			})
		}
	}

	// parents - recursively transform parent nodes including their own parents (grandparents)
	for _, p := range person.Parents {
		var children []FamilyTreeNode
		// Transform this parent's children
		for _, c := range p.Children {
			children = append(children, transformToD3Tree(c))
		}
		// Transform this parent's parents (grandparents) - recursive ancestry
		for _, gp := range p.Parents {
			children = append(children, transformToD3Tree(gp))
		}
		node.Children = append(node.Children, FamilyTreeNode{
			Name: p.Name,
			Attributes: filterAttributes(map[string]interface{}{
				"relation": "parent",
				"gender":   p.Gender,
			}),
			ID:       p.ID,
			Children: children,
			Gender:   p.Gender,
		})
	}

	return node
}

// transformToCoupleTree converts D3 tree into couple tree format (matching Node.js transformation)
func transformToCoupleTree(node FamilyTreeNode) []FamilyTreeNode {
	// Helper to check if a child is a spouse node
	isSpouse := func(child FamilyTreeNode) bool {
		if child.Attributes == nil {
			return false
		}
		relation, ok := child.Attributes["relation"]
		return ok && relation == "spouse"
	}

	// Helper to check if a child is a parent node
	isParent := func(child FamilyTreeNode) bool {
		if child.Attributes == nil {
			return false
		}
		relation, ok := child.Attributes["relation"]
		return ok && relation == "parent"
	}

	// If node has no children or no spouse children, return as is
	if len(node.Children) == 0 {
		attrs := node.Attributes
		if attrs == nil {
			attrs = map[string]interface{}{}
		}
		return []FamilyTreeNode{
			{
				Name:       node.Name,
				ID:         node.ID,
				Gender:     node.Gender,
				Attributes: filterAttributes(attrs),
				Children:   []FamilyTreeNode{},
			},
		}
	}

	// Find all spouse children
	var spouseChildren []FamilyTreeNode
	for _, child := range node.Children {
		if isSpouse(child) {
			spouseChildren = append(spouseChildren, child)
		}
	}

	// If no spouse children, just transform children recursively
	if len(spouseChildren) == 0 {
		attrs := node.Attributes
		if attrs == nil {
			attrs = map[string]interface{}{}
		}
		var transformedChildren []FamilyTreeNode
		for _, c := range node.Children {
			if !isParent(c) {
				transformedChildren = append(transformedChildren, transformToCoupleTree(c)...)
			}
		}
		return []FamilyTreeNode{
			{
				Name:       node.Name,
				ID:         node.ID,
				Gender:     node.Gender,
				Attributes: filterAttributes(attrs),
				Children:   transformedChildren,
			},
		}
	}

	// For each spouse, create a couple node
	var result []FamilyTreeNode
	for _, spouse := range spouseChildren {
		// Couple name
		coupleName := fmt.Sprintf("%s & %s", node.Name, spouse.Name)
		// Couple children: transform spouse's children recursively
		var coupleChildren []FamilyTreeNode
		for _, c := range spouse.Children {
			if !isSpouse(c) && !isParent(c) {
				coupleChildren = append(coupleChildren, transformToCoupleTree(c)...)
			}
		}

		attrs := map[string]interface{}{}
		if node.Attributes != nil {
			for k, v := range node.Attributes {
				// Skip gender attribute for couple nodes
				if k != "gender" {
					attrs[k] = v
				}
			}
		}

		result = append(result, FamilyTreeNode{
			Name:       coupleName,
			ID:         node.ID,
			Gender:     "",
			Attributes: filterAttributes(attrs),
			Children:   coupleChildren,
		})
	}

	// If there are children not under any spouse (single parent children)
	var nonSpouseChildren []FamilyTreeNode
	for _, c := range node.Children {
		if !isSpouse(c) && !isParent(c) {
			nonSpouseChildren = append(nonSpouseChildren, c)
		}
	}

	if len(nonSpouseChildren) > 0 {
		// Attach them to the main person as a separate node
		var transformedChildren []FamilyTreeNode
		for _, c := range nonSpouseChildren {
			transformedChildren = append(transformedChildren, transformToCoupleTree(c)...)
		}
		attrs := node.Attributes
		if attrs == nil {
			attrs = map[string]interface{}{}
		}
		result = append(result, FamilyTreeNode{
			Name:       node.Name,
			ID:         node.ID,
			Gender:     node.Gender,
			Attributes: filterAttributes(attrs),
			Children:   transformedChildren,
		})
	}

	return result
}
