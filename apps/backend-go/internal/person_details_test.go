package app

import (
	"fmt"
	"net/url"
	"sort"
	"strings"
	"testing"
)

func TestPersonDetailsCreateAndLegacyUpdate(t *testing.T) {
	resetDB(t)
	created := call(t, carol, "POST", "/api/trees/"+treeB+"/people", form{
		"name": "  Grandpa  ", "status": "deceased", "birthDate": "1950", "deathDate": "2001-03",
		"deathDateQualifier": "about", "birthPlace": "Malang", "deathPlace": "Surabaya", "notes": "Loved gardening",
	})
	p := dataMap(created)
	if created.Status != 200 {
		t.Fatalf("create: %d %v", created.Status, created.Body)
	}
	want := map[string]any{
		"name": "Grandpa", "gender": "unknown", "birthDate": "1950-01-01T00:00:00Z", "birthDatePrecision": "year",
		"birthDateQualifier": "exact", "deathDate": "2001-03-01T00:00:00Z", "deathDatePrecision": "month",
		"deathDateQualifier": "about", "birthPlace": "Malang", "deathPlace": "Surabaya", "notes": "Loved gardening",
		"nickname": "", "address": "",
	}
	for k, v := range want {
		if p[k] != v {
			t.Errorf("created %s = %v, want %v", k, p[k], v)
		}
	}
	id := fmt.Sprint(p["_id"])

	// A legacy client only sends the original fields and echoes the full birth date back: the new fields and
	// the coarser stored precision survive.
	legacy := form{"name": "Grandpa", "nickname": "gp", "address": "x", "status": "deceased", "gender": "male", "birthDate": "1950-01-01T00:00:00.000Z"}
	updated := call(t, carol, "PUT", "/api/person/"+id, legacy)
	u := dataMap(updated)
	if updated.Status != 200 || u["notes"] != "Loved gardening" || u["deathDate"] != "2001-03-01T00:00:00Z" ||
		u["birthDatePrecision"] != "year" || u["deathDateQualifier"] != "about" || u["gender"] != "male" {
		t.Fatalf("legacy update lost data: %d %v", updated.Status, updated.Body)
	}

	// Explicit empty values clear the new fields; going back to alive drops the stored death date.
	cleared := dataMap(call(t, carol, "PUT", "/api/trees/"+treeB+"/people/"+id, form{
		"name": "Grandpa", "status": "alive", "gender": "male", "birthDate": "1950-06-15", "notes": "", "birthPlace": "",
	}))
	for _, k := range []string{"notes", "birthPlace", "deathDate", "deathDatePrecision", "deathDateQualifier"} {
		if _, ok := cleared[k]; ok {
			t.Errorf("%s should be cleared, got %v", k, cleared[k])
		}
	}
	if cleared["deathPlace"] != "Surabaya" || cleared["birthDatePrecision"] != "day" || cleared["birthDate"] != "1950-06-15T00:00:00Z" {
		t.Errorf("unexpected person after clearing: %v", cleared)
	}
}

func TestPersonValidation(t *testing.T) {
	resetDB(t)
	base := func(over form) form {
		f := form{"name": "X", "status": "alive", "gender": "female"}
		for k, v := range over {
			f[k] = v
		}
		return f
	}
	treePeople := "/api/trees/" + treeB + "/people"
	expectStatus(t, carol, 400, []routeCase{
		{"POST", treePeople, base(form{"name": " "})},
		{"POST", treePeople, base(form{"name": strings.Repeat("n", 121)})},
		{"POST", treePeople, base(form{"nickname": strings.Repeat("n", 61)})},
		{"POST", treePeople, base(form{"address": strings.Repeat("a", 301)})},
		{"POST", treePeople, base(form{"gender": "robot"})},
		{"POST", treePeople, base(form{"status": "missing"})},
		{"POST", treePeople, base(form{"phone": "+62 812<script>"})},
		{"POST", treePeople, base(form{"phone": strings.Repeat("1", 33)})},
		{"POST", treePeople, base(form{"birthDate": "15/06/1950"})},
		{"POST", treePeople, base(form{"birthDate": "1950-13"})},
		{"POST", treePeople, base(form{"birthDate": "1950", "birthDateQualifier": "maybe"})},
		{"POST", treePeople, base(form{"birthPlace": strings.Repeat("p", 201)})},
		{"POST", treePeople, base(form{"notes": strings.Repeat("n", 5001)})},
		{"POST", treePeople, base(form{"deathDate": "2000"})},
		{"POST", treePeople, base(form{"status": "deceased", "birthDate": "1950-05", "deathDate": "1950-04-30"})},
		// Legacy routes keep requiring a gender.
		{"POST", "/api/person", form{"name": "X", "status": "alive"}},
		{"PUT", "/api/person/" + pB1, form{"name": "X", "status": "alive"}},
	})
	expectStatus(t, carol, 200, []routeCase{
		// Nickname and address are optional; tree-scoped creates default the gender to unknown.
		{"POST", treePeople, form{"name": "X", "status": "alive"}},
		{"POST", "/api/person", form{"name": "X", "status": "alive", "gender": "other", "phone": "+62 (812) 555-01"}},
		// Same year at year precision is not "before"; approximate dates are not compared.
		{"POST", treePeople, base(form{"status": "deceased", "birthDate": "1950-05-20", "deathDate": "1950"})},
		{"POST", treePeople, base(form{"status": "deceased", "birthDate": "1950", "birthDateQualifier": "about", "deathDate": "1949"})},
	})
	// Relationship types are limited to parent, child and spouse.
	expectStatus(t, carol, 400, []routeCase{{"POST", "/api/relationship/" + pB1, []map[string]any{{"to": pB1, "type": "sibling"}}}})
}

func TestPeoplePagination(t *testing.T) {
	resetDB(t)
	for i := 0; i < 4; i++ {
		exec := DB.Exec(`INSERT INTO people (id, tree_id, name, nickname, address, status, gender, created_at)
			VALUES (?, ?, ?, ?, '', 'alive', 'male', now() + make_interval(secs => ?))`,
			fmt.Sprintf("p-b-page-%d", i), treeB, fmt.Sprintf("Page %d", i), fmt.Sprintf("pg%d", i), i+1)
		if exec.Error != nil {
			t.Fatal(exec.Error)
		}
	}
	DB.Exec("UPDATE people SET name = '100% Sure_Thing' WHERE id = 'p-b-page-3'")

	var all []string
	cursor := ""
	for pages := 0; pages < 10; pages++ {
		path := "/api/trees/" + treeB + "/people?limit=2"
		if cursor != "" {
			path += "&cursor=" + url.QueryEscape(cursor)
		}
		got := call(t, carol, "GET", path, nil)
		page := dataMap(got)
		if got.Status != 200 || page == nil {
			t.Fatalf("page: %d %v", got.Status, got.Body)
		}
		items, _ := page["items"].([]any)
		all = append(all, ids(items)...)
		next, ok := page["nextCursor"].(string)
		if !ok {
			if page["nextCursor"] != nil {
				t.Fatalf("nextCursor = %v", page["nextCursor"])
			}
			break
		}
		cursor = next
	}
	want := []string{pB1, "p-b-page-0", "p-b-page-1", "p-b-page-2", "p-b-page-3"}
	if strings.Join(all, ",") != strings.Join(want, ",") {
		t.Errorf("paged = %v, want %v", all, want)
	}

	search := func(q string) []string {
		got := call(t, carol, "GET", "/api/trees/"+treeB+"/people?limit=50&q="+url.QueryEscape(q), nil)
		items, _ := dataMap(got)["items"].([]any)
		return ids(items)
	}
	if got := search("PG1"); strings.Join(got, ",") != "p-b-page-1" {
		t.Errorf("nickname search = %v", got)
	}
	if got := search("100%"); strings.Join(got, ",") != "p-b-page-3" {
		t.Errorf("literal %% search = %v", got)
	}
	if got := search("g_"); len(got) != 0 {
		t.Errorf("underscore must match literally, got %v", got)
	}

	expectStatus(t, carol, 400, []routeCase{
		{"GET", "/api/trees/" + treeB + "/people?limit=0", nil},
		{"GET", "/api/trees/" + treeB + "/people?limit=201", nil},
		{"GET", "/api/trees/" + treeB + "/people?limit=x", nil},
		{"GET", "/api/trees/" + treeB + "/people?limit=5&cursor=not-a-cursor", nil},
	})
	// Without limit the full-list shape is unchanged.
	if got := call(t, carol, "GET", "/api/trees/"+treeB+"/people", nil).list(); len(got) != 5 {
		t.Errorf("full list = %d people, want 5", len(got))
	}
	// Branch-scoped editors only page through their branch.
	bobPage := dataMap(call(t, bob, "GET", "/api/trees/"+treeA+"/people?limit=10", nil))
	if items, _ := bobPage["items"].([]any); strings.Join(ids(items), ",") != pA1 {
		t.Errorf("bob's page = %v", ids(items))
	}
}

func TestTreeGraph(t *testing.T) {
	resetDB(t)
	exec := func(sql string, args ...any) {
		t.Helper()
		if err := DB.Exec(sql, args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	// pA3 is a child of pA1 (parent row) and pA2 (only the inverse child row); pGone is deleted.
	exec(`INSERT INTO people (id, tree_id, name, nickname, address, status, gender, birth_date, birth_date_precision, created_at) VALUES
		('p-a3', ?, 'A Three', 'a3', '', 'alive', 'female', '1990-01-01T00:00:00Z', 'year', now() + interval '2 seconds'),
		('p-gone', ?, 'Gone', 'g', '', 'alive', 'male', NULL, NULL, now() + interval '3 seconds')`, treeA, treeA)
	exec("UPDATE people SET deleted_at = now() WHERE id = 'p-gone'")
	exec(`INSERT INTO relationships (id, tree_id, from_id, to_id, type, sort_order) VALUES
		('r3', ?, ?, 'p-a3', 'parent', 2), ('r4', ?, 'p-a3', ?, 'child', 2), ('r5', ?, 'p-a3', ?, 'child', 2),
		('r6', ?, ?, 'p-gone', 'spouse', 0), ('r7', ?, 'p-gone', 'p-a3', 'parent', 0)`,
		treeA, pA1, treeA, pA1, treeA, pA2, treeA, pA2, treeA)

	graph := func(user string) map[string]any {
		t.Helper()
		got := call(t, user, "GET", "/api/trees/"+treeA+"/graph", nil)
		if got.Status != 200 {
			t.Fatalf("graph as %s: %d %v", user, got.Status, got.Body)
		}
		return dataMap(got)
	}
	editable := func(g map[string]any) []string {
		out := []string{}
		for _, p := range g["people"].([]any) {
			if m := p.(map[string]any); m["canEdit"] == true {
				out = append(out, fmt.Sprint(m["_id"]))
			}
		}
		sort.Strings(out)
		return out
	}

	g := graph(alice)
	tree := g["tree"].(map[string]any)
	if tree["_id"] != treeA || tree["role"] != "owner" || tree["branchScoped"] != true || tree["name"] != "A" {
		t.Errorf("tree = %v", tree)
	}
	if got := ids(g["people"].([]any)); strings.Join(got, ",") != pA1+","+pA2+",p-a3" {
		t.Errorf("people = %v", got)
	}
	unions := g["unions"].([]any)
	if len(unions) != 1 || unions[0].(map[string]any)["_id"] != pA1+":"+pA2 {
		t.Errorf("unions = %v", unions)
	}
	edges := []string{}
	for _, e := range g["parentChild"].([]any) {
		m := e.(map[string]any)
		edges = append(edges, fmt.Sprintf("%v>%v#%v", m["parent"], m["child"], m["order"]))
	}
	if strings.Join(edges, ",") != pA1+">p-a3#2,"+pA2+">p-a3#2" {
		t.Errorf("parentChild = %v", edges)
	}
	for _, p := range g["people"].([]any) {
		m := p.(map[string]any)
		if m["_id"] == "p-a3" && (m["birthDate"] != "1990-01-01T00:00:00Z" || m["birthDatePrecision"] != "year" || m["deathDate"] != nil) {
			t.Errorf("p-a3 = %v", m)
		}
	}
	if got := editable(g); len(got) != 3 {
		t.Errorf("owner canEdit = %v", got)
	}
	// canEdit is per caller even when the graph comes from the cache.
	if got := editable(graph(bob)); strings.Join(got, ",") != pA1 {
		t.Errorf("bob canEdit = %v", got)
	}
	if got := editable(graph(dave)); len(got) != 0 {
		t.Errorf("viewer canEdit = %v", got)
	}
	if got := editable(graph(alice)); len(got) != 3 {
		t.Errorf("owner canEdit after cache = %v", got)
	}
	expectStatus(t, carol, 404, []routeCase{{"GET", "/api/trees/" + treeA + "/graph", nil}})

	// Writes invalidate the cached graph.
	expectStatus(t, alice, 200, []routeCase{{"DELETE", "/api/person/p-a3", nil}})
	if got := graph(alice); len(got["parentChild"].([]any)) != 0 || len(got["people"].([]any)) != 2 {
		t.Errorf("graph after delete = %v", got)
	}
}
