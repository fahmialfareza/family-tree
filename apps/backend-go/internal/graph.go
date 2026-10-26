package app

import (
	"context"
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// Tree graph for the canvas: every live person of the tree plus deduplicated couples (unions) and
// parent→child edges. The graph itself is the same for every member and is cached per tree version;
// canEdit depends on the caller and is filled in per request.

// maxGraphPeople bounds the graph a single request can load (same bound as the legacy tree traversal).
const maxGraphPeople = maxTreeNodes

var errGraphTooLarge = errors.New("tree graph too large")

type graphPerson struct {
	ID                 string     `json:"_id"`
	Name               string     `json:"name"`
	Nickname           string     `json:"nickname"`
	Gender             string     `json:"gender"`
	Status             string     `json:"status"`
	BirthDate          *time.Time `json:"birthDate"`
	BirthDatePrecision *string    `json:"birthDatePrecision"`
	DeathDate          *time.Time `json:"deathDate"`
	DeathDatePrecision *string    `json:"deathDatePrecision"`
	Religion           *string    `json:"religion,omitempty"`
	PhotoURL           string     `json:"photoUrl"`
	CanEdit            bool       `json:"canEdit"`
}

type graphUnion struct {
	ID       string    `json:"_id"` // "<smaller person id>:<larger person id>"
	Partners [2]string `json:"partners"`
}

type graphParentChild struct {
	Parent string `json:"parent"`
	Child  string `json:"child"`
	Order  int    `json:"order"`
}

// treeGraph is the cached, user-independent part (CanEdit is always false in it).
type treeGraph struct {
	People      []graphPerson      `json:"people"`
	Unions      []graphUnion       `json:"unions"`
	ParentChild []graphParentChild `json:"parentChild"`
}

const cacheTTLGraph = 5 * time.Minute

func repoGetTreeGraph(ctx context.Context, treeID string) (*treeGraph, error) {
	defer newrelic.FromContext(ctx).StartSegment("store/repoGetTreeGraph").End()

	cacheKey := treeCacheKey(ctx, treeID, "graph")
	if cached, ok := cacheGet[*treeGraph](ctx, cacheKey); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var people []personRow
	if err := byCreation(DB.WithContext(ctx)).Scopes(inTree(treeID)).
		Select("id", "created_at", "name", "nickname", "gender", "status", "birth_date", "birth_date_precision",
			"death_date", "death_date_precision", "religion", "photo_url").
		Limit(maxGraphPeople + 1).Find(&people).Error; err != nil {
		return nil, err
	}
	if len(people) > maxGraphPeople {
		return nil, errGraphTooLarge
	}

	// Soft-deleted relationships are filtered by GORM; the live-person check drops edges to deleted people.
	var rels []relationshipRow
	if err := byCreation(DB.WithContext(ctx)).Scopes(inTree(treeID)).
		Select("id", "created_at", "from_id", "to_id", "type", "sort_order").
		Find(&rels).Error; err != nil {
		return nil, err
	}

	g := &treeGraph{
		People:      make([]graphPerson, 0, len(people)),
		Unions:      []graphUnion{},
		ParentChild: []graphParentChild{},
	}
	live := make(map[string]struct{}, len(people))
	utc := func(t *time.Time) *time.Time {
		if t == nil {
			return nil
		}
		u := t.UTC()
		return &u
	}
	for _, p := range people {
		live[p.ID] = struct{}{}
		g.People = append(g.People, graphPerson{
			ID: p.ID, Name: p.Name, Nickname: p.Nickname, Gender: p.Gender, Status: p.Status,
			BirthDate: utc(p.BirthDate), BirthDatePrecision: p.BirthDatePrecision,
			DeathDate: utc(p.DeathDate), DeathDatePrecision: p.DeathDatePrecision, Religion: p.Religion,
			PhotoURL: p.PhotoURL,
		})
	}

	type edge struct{ parent, child string }
	unions := map[string]struct{}{}
	edges := map[edge]struct{}{}
	// "child" rows (from=child, to=parent) only fill in pairs whose "parent" row is missing.
	var inferred []graphParentChild
	for _, r := range rels {
		if r.FromID == r.ToID {
			continue
		}
		if _, ok := live[r.FromID]; !ok {
			continue
		}
		if _, ok := live[r.ToID]; !ok {
			continue
		}
		switch r.Type {
		case "spouse":
			a, b := r.FromID, r.ToID
			if b < a {
				a, b = b, a
			}
			id := a + ":" + b
			if _, ok := unions[id]; !ok {
				unions[id] = struct{}{}
				g.Unions = append(g.Unions, graphUnion{ID: id, Partners: [2]string{a, b}})
			}
		case "parent":
			e := edge{r.FromID, r.ToID}
			if _, ok := edges[e]; !ok {
				edges[e] = struct{}{}
				g.ParentChild = append(g.ParentChild, graphParentChild{Parent: r.FromID, Child: r.ToID, Order: r.SortOrder})
			}
		case "child":
			inferred = append(inferred, graphParentChild{Parent: r.ToID, Child: r.FromID, Order: r.SortOrder})
		}
	}
	for _, pc := range inferred {
		e := edge{pc.Parent, pc.Child}
		if _, ok := edges[e]; !ok {
			edges[e] = struct{}{}
			g.ParentChild = append(g.ParentChild, pc)
		}
	}

	cacheSet(ctx, cacheKey, g, cacheTTLGraph)
	return g, nil
}

// writablePeople returns which people the caller may edit: all=true means every person (nil set);
// otherwise only those in the set. Branch-scoped editors are resolved with one query.
func (a *treeAccess) writablePeople(ctx context.Context) (all bool, set map[string]struct{}, err error) {
	if !a.atLeast(TreeRoleEditor) {
		return false, map[string]struct{}{}, nil
	}
	if a.seesWholeTree() {
		return true, nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var ids []string
	err = DB.WithContext(ctx).Model(&personOwner{}).
		Where("user_id = ? AND person_id IN (?)", a.UserID, DB.Model(&personRow{}).Select("id").Scopes(inTree(a.TreeID))).
		Pluck("person_id", &ids).Error
	if err != nil {
		return false, nil, err
	}
	set = make(map[string]struct{}, len(ids))
	for _, id := range ids {
		set[id] = struct{}{}
	}
	return false, set, nil
}

// getTreeGraph serves GET /api/trees/:treeId/graph.
func getTreeGraph(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/getTreeGraph").End()
	access := currentAccess(c)
	tree, err := getTreeRepo(c, access.TreeID)
	if err != nil {
		abortServerError(c, err)
		return
	}
	g, err := repoGetTreeGraph(c, access.TreeID)
	if errors.Is(err, errGraphTooLarge) {
		responseError(c, "This tree has more than 5000 people and is too large to load at once", 413)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	all, writable, err := access.writablePeople(c)
	if err != nil {
		abortServerError(c, err)
		return
	}
	// Copy before setting canEdit: without Redis the cached value is not shared, but keep it user-independent.
	people := make([]graphPerson, len(g.People))
	copy(people, g.People)
	for i := range people {
		_, ok := writable[people[i].ID]
		people[i].CanEdit = all || ok
	}
	responseSuccess(c, gin.H{
		"tree": gin.H{
			"_id":          tree.ID,
			"name":         tree.Name,
			"role":         access.Role,
			"branchScoped": tree.BranchScoped,
		},
		"people":      people,
		"unions":      g.Unions,
		"parentChild": g.ParentChild,
	}, 200)
}
