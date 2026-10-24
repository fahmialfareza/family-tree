package app

import (
	"context"
	"fmt"
	"log/slog"
	"sort"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
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
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getFamilyTree").End()
	personId := c.Param("id")
	treeID := currentAccess(c).TreeID
	if _, err := getPersonByIdRepo(c, treeID, personId); err != nil {
		responseError(c, "Person not found", 404)
		return
	}
	mode := c.Query("mode")
	// Default to "parent" mode if not specified (matching Node.js)
	if mode == "" {
		mode = "parent"
	}
	ctx := c.Request.Context()
	// Match Node.js logic: mode=="parent" shows children, mode=="child" shows parents
	withChildren := mode == "parent"
	withParent := mode == "child"
	inode, err := buildFamilyTree(ctx, treeID, personId, withChildren, withParent)
	if err != nil {
		newrelic.FromContext(ctx).NoticeError(err)
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

// sortedKeys returns set members in a stable order; map iteration order is random in Go.
func sortedKeys(set map[string]struct{}) []string {
	keys := make([]string, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func isMale(p *Person) bool { return p != nil && p.Gender == "male" }

// maxTreeNodes bounds the traversal so one request cannot walk an arbitrarily large graph.
const maxTreeNodes = 5000

func buildFamilyTree(ctx context.Context, treeID, personId string, withChildren bool, withParent bool) (internalNode, error) {
	defer newrelic.FromContext(ctx).StartSegment("service/buildFamilyTree").End()
	debug := treeDebug()

	// ── Phase 1: BFS to discover all person IDs and pre-load their relationships ────
	// relsByPerson maps personID → all relationships where that person is From or To.
	relsByPerson := map[string][]*Relationship{}
	visited := map[string]struct{}{personId: {}}
	frontier := []string{personId}

	for len(frontier) > 0 {
		batchRels, err := getRelationshipsByPersonIdsRepo(ctx, treeID, frontier)
		if err != nil {
			break // degrade gracefully; build() will use whatever was pre-loaded
		}
		var next []string
		for _, id := range frontier {
			rels := batchRels[id]
			relsByPerson[id] = rels
			for _, rel := range rels {
				var candidate string
				if withChildren {
					if rel.Type == "spouse" {
						if rel.From == id {
							candidate = rel.To
						} else if rel.To == id {
							candidate = rel.From
						}
					} else if rel.Type == "parent" && rel.From == id {
						candidate = rel.To
					}
				}
				if withParent && rel.Type == "parent" && rel.To == id {
					candidate = rel.From
				}
				if candidate != "" && len(visited) < maxTreeNodes {
					if _, ok := visited[candidate]; !ok {
						visited[candidate] = struct{}{}
						next = append(next, candidate)
					}
				}
			}
		}
		frontier = next
	}

	if debug {
		slog.DebugContext(ctx, "tree: pre-loaded people via BFS", "count", len(visited))
	}

	// ── Phase 2: Bulk-load all person documents in one DB round-trip ─────────────
	allIDs := make([]string, 0, len(visited))
	for id := range visited {
		allIDs = append(allIDs, id)
	}
	personsByID, err := getPersonsByIdsRepo(ctx, treeID, allIDs)
	if err != nil {
		return internalNode{}, err
	}

	// ── Phase 3: Build tree in-memory using pre-loaded maps (no DB calls) ─────────
	var build func(id string, wc bool, wp bool) (internalNode, error)
	build = func(id string, wc bool, wp bool) (internalNode, error) {
		p, ok := personsByID[id]
		if !ok {
			return internalNode{}, fmt.Errorf("person %s not found in preloaded data", id)
		}
		rels := relsByPerson[id]

		if debug {
			slog.DebugContext(ctx, "tree: node", "id", id, "rels", len(rels), "with_children", wc, "with_parents", wp)
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

			myChildrenSet := map[string]struct{}{}
			childOrderMap := map[string]int{}
			for _, rel := range rels {
				if rel.Type == "parent" && rel.From == id {
					myChildrenSet[rel.To] = struct{}{}
					childOrderMap[rel.To] = rel.Order
				}
			}

			sharedChildrenSet := map[string]struct{}{}
			spouseNodes := []internalNode{}
			for _, spouseId := range sortedKeys(spouseSet) {
				spouseRels := relsByPerson[spouseId] // pre-loaded; no DB call
				spouseChildrenSet := map[string]struct{}{}
				for _, srel := range spouseRels {
					if srel.Type == "parent" && srel.From == spouseId {
						spouseChildrenSet[srel.To] = struct{}{}
					}
				}

				type childWithOrder struct {
					id    string
					order int
				}
				sharedChildrenList := []childWithOrder{}
				for cid := range myChildrenSet {
					if _, ok := spouseChildrenSet[cid]; ok {
						sharedChildrenList = append(sharedChildrenList, childWithOrder{id: cid, order: childOrderMap[cid]})
						sharedChildrenSet[cid] = struct{}{}
					}
				}
				sort.Slice(sharedChildrenList, func(i, j int) bool {
					if sharedChildrenList[i].order != sharedChildrenList[j].order {
						return sharedChildrenList[i].order < sharedChildrenList[j].order
					}
					return sharedChildrenList[i].id < sharedChildrenList[j].id // stable tie-break for equal order
				})

				children := []internalNode{}
				for _, child := range sharedChildrenList {
					childNode, err := build(child.id, true, false)
					if err == nil {
						if debug {
							slog.DebugContext(ctx, "tree: couple child", "id", id, "spouse", spouseId, "child", child.id, "order", child.order)
						}
						children = append(children, childNode)
					}
				}

				sp, ok := personsByID[spouseId] // pre-loaded; no DB call
				if ok {
					if debug {
						slog.DebugContext(ctx, "tree: spouse children", "spouse", spouseId, "count", len(children))
					}
					spouseNodes = append(spouseNodes, internalNode{
						ID:       sp.ID,
						Name:     sp.Nickname,
						Gender:   sp.Gender,
						Children: children,
					})
				}
			}

			type childWithOrder struct {
				id    string
				order int
			}
			singleChildrenList := []childWithOrder{}
			for cid := range myChildrenSet {
				if _, ok := sharedChildrenSet[cid]; !ok {
					singleChildrenList = append(singleChildrenList, childWithOrder{id: cid, order: childOrderMap[cid]})
				}
			}
			sort.Slice(singleChildrenList, func(i, j int) bool {
				if singleChildrenList[i].order != singleChildrenList[j].order {
					return singleChildrenList[i].order < singleChildrenList[j].order
				}
				return singleChildrenList[i].id < singleChildrenList[j].id // stable tie-break for equal order
			})

			singleChildren := []internalNode{}
			for _, child := range singleChildrenList {
				childNode, err := build(child.id, true, false)
				if err == nil {
					if debug {
						slog.DebugContext(ctx, "tree: single-parent child", "id", id, "child", child.id, "order", child.order)
					}
					singleChildren = append(singleChildren, childNode)
				}
			}

			node.Children = append(node.Children, singleChildren...)
			node.Spouses = append(node.Spouses, spouseNodes...)
		}

		if wp {
			parentIdsSet := map[string]struct{}{}
			for _, rel := range rels {
				if rel.Type == "parent" && rel.To == id {
					parentIdsSet[rel.From] = struct{}{}
				}
			}
			// Father first, then by ID, so parents do not swap places between requests.
			parentIDs := sortedKeys(parentIdsSet)
			sort.SliceStable(parentIDs, func(i, j int) bool {
				return isMale(personsByID[parentIDs[i]]) && !isMale(personsByID[parentIDs[j]])
			})
			parents := []internalNode{}
			for _, pid := range parentIDs {
				parentNode, err := build(pid, false, true)
				if err == nil {
					if debug {
						slog.DebugContext(ctx, "tree: parent", "id", id, "parent", pid)
					}
					parents = append(parents, parentNode)
				}
			}
			node.Parents = append(node.Parents, parents...)
		}

		return node, nil
	}

	if !withChildren && !withParent {
		person, ok := personsByID[personId]
		if !ok {
			return internalNode{}, fmt.Errorf("person %s not found", personId)
		}
		return internalNode{
			ID:       person.ID,
			Name:     person.Nickname,
			Gender:   person.Gender,
			Children: []internalNode{},
		}, nil
	}
	if withChildren {
		return build(personId, true, false)
	}
	return build(personId, false, true)
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
