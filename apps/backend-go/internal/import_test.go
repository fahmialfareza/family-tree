package app

import (
	"fmt"
	"testing"
)

// Fixtures from resetDB: tree A (branch-scoped) has pA1 (owned by bob) married to pA2 (owned by alice);
// alice owns A, bob is an editor, dave a viewer. Tree B is carol's.

func importBody(source, person, scope string, extra map[string]any) map[string]any {
	b := map[string]any{"sourceTreeId": source, "personId": person, "scope": scope}
	for k, v := range extra {
		b[k] = v
	}
	return b
}

// newTreeFor creates a tree owned by user and returns its id.
func newTreeFor(t *testing.T, user, name string) string {
	t.Helper()
	res := call(t, user, "POST", "/api/trees", map[string]any{"name": name})
	if res.Status != 201 {
		t.Fatalf("create tree: %d %v", res.Status, res.Body)
	}
	return str(dataMap(res), "_id")
}

func TestCopyBranchBetweenTrees(t *testing.T) {
	resetDB(t)
	// Give pA1 a child and some private details that must not travel.
	exec := func(sql string, args ...any) {
		if err := DB.Exec(sql, args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO people (id, tree_id, name, status, gender, birth_date, birth_date_precision, birth_place, notes, phone, address, photo_url)
	      VALUES ('p-a3', ?, 'A Three', 'alive', 'female', '1990-01-01', 'year', 'Malang', 'secret notes', '0812', 'Jl. X', 'https://img/x.jpg')`, treeA)
	exec("INSERT INTO person_owners (person_id, user_id) VALUES ('p-a3', ?), ('p-a3', ?)", alice, bob)
	exec(`INSERT INTO relationships (id, tree_id, from_id, to_id, type, sort_order) VALUES
	      ('r3', ?, ?, 'p-a3', 'parent', 1), ('r4', ?, 'p-a3', ?, 'child', 1)`, treeA, pA1, treeA, pA1)
	exec("UPDATE people SET phone = '0899', notes = 'private' WHERE id = ?", pA1)

	dest := newTreeFor(t, alice, "Alice's own tree")

	// Preview first: nothing is written.
	preview := call(t, alice, "POST", "/api/trees/"+dest+"/import", importBody(treeA, pA1, "descendants", map[string]any{"dryRun": true}))
	if preview.Status != 200 || dataMap(preview)["created"].(float64) != 3 {
		t.Fatalf("preview: %d %v", preview.Status, preview.Body)
	}
	var count int64
	DB.Table("people").Where("tree_id = ?", dest).Count(&count)
	if count != 0 {
		t.Fatal("dry run wrote people")
	}

	// Copy pA1 with descendants: pA1, partner pA2 and child p-a3, plus the links between them.
	res := call(t, alice, "POST", "/api/trees/"+dest+"/import", importBody(treeA, pA1, "descendants", nil))
	d := dataMap(res)
	if res.Status != 201 || d["created"].(float64) != 3 || d["links"].(float64) != 4 || str(d, "rootId") == "" {
		t.Fatalf("import: %d %v", res.Status, res.Body)
	}
	g := dataMap(call(t, alice, "GET", "/api/trees/"+dest+"/graph", nil))
	if people, _ := g["people"].([]any); len(people) != 3 {
		t.Errorf("graph people = %v", g["people"])
	}
	if unions, _ := g["unions"].([]any); len(unions) != 1 {
		t.Errorf("graph unions = %v", g["unions"])
	}
	if pc, _ := g["parentChild"].([]any); len(pc) != 1 {
		t.Errorf("graph parentChild = %v", g["parentChild"])
	}
	// Only genealogy travels.
	var copied personRow
	DB.Where("tree_id = ? AND name = 'A Three'", dest).First(&copied)
	if copied.Phone != "" || copied.Address != "" || copied.PhotoURL != "" || copied.Notes != nil {
		t.Errorf("private details were copied: %+v", copied)
	}
	if copied.BirthPlace == nil || *copied.BirthPlace != "Malang" || copied.BirthDatePrecision == nil || *copied.BirthDatePrecision != "year" {
		t.Errorf("genealogy not copied: %+v", copied)
	}

	// Copying again reuses the copies; with updateExisting they pick up changes from the originals.
	exec("UPDATE people SET name = 'A Three Renamed' WHERE id = 'p-a3'")
	again := dataMap(call(t, alice, "POST", "/api/trees/"+dest+"/import", importBody(treeA, pA1, "both", map[string]any{"updateExisting": true})))
	if again["created"].(float64) != 0 || again["reused"].(float64) != 3 || again["updated"].(float64) != 3 {
		t.Errorf("re-import: %v", again)
	}
	DB.Table("people").Where("tree_id = ?", dest).Count(&count)
	if count != 3 {
		t.Errorf("duplicates after re-import: %d people", count)
	}
	var renamed int64
	DB.Table("people").Where("tree_id = ? AND name = 'A Three Renamed'", dest).Count(&renamed)
	if renamed != 1 {
		t.Error("updateExisting did not refresh the copy")
	}

	// Per-person update from the original.
	exec("UPDATE people SET name = 'A Two Updated', death_place = 'Batu', status = 'deceased' WHERE id = ?", pA2)
	var copyOfA2 string
	DB.Table("people").Select("id").Where("tree_id = ? AND source_person_id = ?", dest, pA2).Scan(&copyOfA2)
	person := dataMap(call(t, alice, "GET", "/api/trees/"+dest+"/people/"+copyOfA2, nil))
	src, _ := person["copiedFrom"].(map[string]any)
	if src == nil || src["treeName"] != "A" || src["canUpdate"] != true {
		t.Fatalf("copiedFrom = %v", person["copiedFrom"])
	}
	synced := call(t, alice, "POST", "/api/trees/"+dest+"/people/"+copyOfA2+"/sync", nil)
	if synced.Status != 200 || dataMap(synced)["name"] != "A Two Updated" || dataMap(synced)["deathPlace"] != "Batu" {
		t.Fatalf("sync: %d %v", synced.Status, synced.Body)
	}
	// Edits to the copy never touch the original.
	call(t, alice, "PUT", "/api/trees/"+dest+"/people/"+copyOfA2, form{"name": "Only in my tree", "gender": "female", "status": "deceased"})
	var original personRow
	DB.Where("id = ?", pA2).First(&original)
	if original.Name != "A Two Updated" {
		t.Errorf("editing a copy changed the original: %s", original.Name)
	}
}

func TestCopyPermissions(t *testing.T) {
	resetDB(t)
	bobsTree := newTreeFor(t, bob, "Bob's tree")
	davesTree := newTreeFor(t, dave, "Dave's tree")
	carolsTree := newTreeFor(t, carol, "Carol's other tree")

	// Branch-scoped editor: only people shared with them; the partner outside the branch is skipped.
	res := call(t, bob, "POST", "/api/trees/"+bobsTree+"/import", importBody(treeA, pA1, "nearby", map[string]any{"steps": 2}))
	d := dataMap(res)
	if res.Status != 201 || d["created"].(float64) != 1 || d["skipped"].(float64) != 1 {
		t.Errorf("branch-scoped editor import: %d %v", res.Status, res.Body)
	}
	expectStatus(t, bob, 403, []routeCase{{"POST", "/api/trees/" + bobsTree + "/import", importBody(treeA, pA2, "descendants", nil)}})
	// Viewers cannot take data out; non-members cannot even see the source; copying into a tree you only
	// view is refused; a tree cannot copy from itself.
	expectStatus(t, dave, 403, []routeCase{{"POST", "/api/trees/" + davesTree + "/import", importBody(treeA, pA1, "descendants", nil)}})
	expectStatus(t, carol, 404, []routeCase{{"POST", "/api/trees/" + carolsTree + "/import", importBody(treeA, pA1, "descendants", nil)}})
	expectStatus(t, dave, 403, []routeCase{{"POST", "/api/trees/" + treeA + "/import", importBody(davesTree, pA1, "descendants", nil)}})
	expectStatus(t, alice, 400, []routeCase{
		{"POST", "/api/trees/" + treeA + "/import", importBody(treeA, pA1, "descendants", nil)},
		{"POST", "/api/trees/" + treeA + "/import", importBody(treeB, pB1, "sideways", nil)},
		{"POST", "/api/trees/" + treeA + "/import", importBody(treeB, pB1, "nearby", map[string]any{"steps": 9})},
	})

	// Someone who loses access to the original can no longer update from it, and sees no source details.
	var copyID string
	DB.Table("people").Select("id").Where("tree_id = ? AND source_person_id = ?", bobsTree, pA1).Scan(&copyID)
	DB.Exec("DELETE FROM tree_members WHERE tree_id = ? AND user_id = ?", treeA, bob)
	person := dataMap(call(t, bob, "GET", fmt.Sprintf("/api/trees/%s/people/%s", bobsTree, copyID), nil))
	if src, _ := person["copiedFrom"].(map[string]any); src == nil || src["treeName"] != nil || src["canUpdate"] != false {
		t.Errorf("copiedFrom after losing access = %v", person["copiedFrom"])
	}
	expectStatus(t, bob, 403, []routeCase{{"POST", fmt.Sprintf("/api/trees/%s/people/%s/sync", bobsTree, copyID), nil}})
}
