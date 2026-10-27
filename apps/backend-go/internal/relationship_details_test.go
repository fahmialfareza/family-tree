package app

import (
	"fmt"
	"sort"
	"strings"
	"testing"
)

// The user's own cases: Nenek has birth parents and, at the same time, foster parents (asuh). In one family the
// foster father is her father's brother (so also a blood relative); in the other an unrelated couple.
func TestRelationshipDetails(t *testing.T) {
	resetDB(t)
	exec := func(sql string, args ...any) {
		t.Helper()
		if err := DB.Exec(sql, args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	// pA1 + pA2 (already partners in the seed) are Nenek's birth parents; p-uncle is pA1's brother (child of
	// p-gp) and, with his wife p-aunt, raised Nenek.
	exec(`INSERT INTO people (id, tree_id, name, status, gender, created_at) VALUES
		('p-nenek', ?, 'Nenek', 'alive', 'female', now()), ('p-uncle', ?, 'Paman', 'alive', 'male', now()),
		('p-aunt', ?, 'Bibi', 'alive', 'female', now()), ('p-gp', ?, 'Mbah', 'deceased', 'male', now())`, treeA, treeA, treeA, treeA)
	exec("INSERT INTO person_owners (person_id, user_id) SELECT id, ? FROM people WHERE id IN ('p-nenek','p-uncle','p-aunt','p-gp')", alice)
	rels := func(id string, body []map[string]any) response {
		t.Helper()
		return call(t, alice, "POST", "/api/trees/"+treeA+"/people/"+id+"/relationships", body)
	}

	// Invalid details are refused before anything is written.
	for _, body := range [][]map[string]any{
		{{"to": pA1, "type": "child", "kind": "cousin"}},
		{{"to": pA1, "type": "child", "status": "divorced"}},
		{{"to": "p-uncle", "type": "spouse", "kind": "foster"}},
		{{"to": "p-uncle", "type": "spouse", "status": "single"}},
		{{"to": "p-uncle", "type": "spouse", "endDate": "1990"}},
		{{"to": "p-uncle", "type": "spouse", "status": "divorced", "startDate": "1990", "endDate": "1980"}},
		{{"to": "p-uncle", "type": "spouse", "startDate": "May 1990"}},
	} {
		if res := rels("p-aunt", body); res.Status != 400 {
			t.Errorf("%v: got %d, want 400 (%v)", body, res.Status, res.Body)
		}
	}

	// Nenek: birth parents pA1 + pA2, foster parents p-uncle + p-aunt.
	if res := rels("p-nenek", []map[string]any{
		{"to": pA1, "type": "child"}, {"to": pA2, "type": "child", "kind": "birth"},
		{"to": "p-uncle", "type": "child", "kind": "foster"}, {"to": "p-aunt", "type": "child", "kind": "foster"},
	}); res.Status != 201 {
		t.Fatalf("link nenek: %d %v", res.Status, res.Body)
	}
	// p-uncle is a child of p-gp (Nenek's grandfather side); he married p-aunt in 1950 and they divorced in 1970.
	// The endpoint replaces a person's whole set, so his link to Nenek is sent again.
	if res := rels("p-uncle", []map[string]any{{"to": "p-gp", "type": "child"}, {"to": "p-nenek", "type": "parent", "kind": "foster"}}); res.Status != 201 {
		t.Fatalf("uncle's parent: %d %v", res.Status, res.Body)
	}
	if res := rels("p-aunt", []map[string]any{
		{"to": "p-uncle", "type": "spouse", "status": "divorced", "startDate": "1950", "startDateQualifier": "about", "startPlace": "Klaten", "endDate": "1970-05"},
		{"to": "p-nenek", "type": "parent", "kind": "foster"},
	}); res.Status != 201 {
		t.Fatalf("aunt: %d %v", res.Status, res.Body)
	}

	// Both rows of every pair carry the details.
	var rows []relationshipRow
	DB.Where("tree_id = ? AND (from_id IN ('p-nenek','p-aunt','p-uncle') OR to_id IN ('p-nenek','p-aunt','p-uncle'))", treeA).Find(&rows)
	got := []string{}
	for _, r := range rows {
		d := r.details()
		got = append(got, fmt.Sprintf("%s>%s:%s:%s:%s", r.FromID, r.ToID, r.Type, d.Kind, d.Status))
	}
	sort.Strings(got)
	for _, want := range []string{
		"p-aunt>p-nenek:parent:foster:", "p-nenek>p-aunt:child:foster:", "p-uncle>p-nenek:parent:foster:", "p-nenek>p-uncle:child:foster:",
		"p-nenek>" + pA1 + ":child::", pA2 + ">p-nenek:parent::",
		"p-aunt>p-uncle:spouse::divorced", "p-uncle>p-aunt:spouse::divorced",
	} {
		if !contains(got, want) {
			t.Errorf("missing row %s in %v", want, got)
		}
	}

	// The graph sends kinds on parent links and the couple's status and dates.
	g := dataMap(call(t, alice, "GET", "/api/trees/"+treeA+"/graph", nil))
	kinds := map[string]string{}
	for _, e := range g["parentChild"].([]any) {
		m := e.(map[string]any)
		if m["child"] == "p-nenek" {
			kinds[fmt.Sprint(m["parent"])] = fmt.Sprint(m["kind"])
		}
	}
	if kinds[pA1] != "<nil>" || kinds[pA2] != "<nil>" || kinds["p-uncle"] != "foster" || kinds["p-aunt"] != "foster" {
		t.Errorf("nenek's parents = %v", kinds)
	}
	var couple map[string]any
	for _, u := range g["unions"].([]any) {
		if m := u.(map[string]any); m["_id"] == "p-aunt:p-uncle" {
			couple = m
		}
	}
	if couple == nil || couple["status"] != "divorced" || couple["startDatePrecision"] != "year" || couple["startDateQualifier"] != "about" ||
		couple["startPlace"] != "Klaten" || couple["endDatePrecision"] != "month" || !strings.HasPrefix(fmt.Sprint(couple["endDate"]), "1970-05-01") {
		t.Errorf("couple = %v", couple)
	}

	// Changing only the kind updates both rows; re-saving the same set changes nothing.
	if res := rels("p-nenek", []map[string]any{
		{"to": pA1, "type": "child"}, {"to": pA2, "type": "child"},
		{"to": "p-uncle", "type": "child", "kind": "adopted"}, {"to": "p-aunt", "type": "child", "kind": "foster"},
	}); res.Status != 201 || dataMap(res)["updated"].(float64) != 2 {
		t.Fatalf("change kind: %d %v", res.Status, res.Body)
	}
	var kind string
	DB.Table("relationships").Select("kind").Where("from_id = 'p-uncle' AND to_id = 'p-nenek' AND deleted_at IS NULL").Scan(&kind)
	if kind != "adopted" {
		t.Errorf("inverse kind = %q, want adopted", kind)
	}

	// GEDCOM: one family per parent set, the foster/adoptive one with PEDI; the couple's MARR and DIV.
	ged := rawGet(t, alice, "/api/trees/"+treeA+"/export?format=gedcom").Body.String()
	for _, want := range []string{"2 PEDI adopted", "1 MARR\n2 DATE ABT 1950\n2 PLAC Klaten", "1 DIV\n2 DATE MAY 1970"} {
		if !strings.Contains(ged, want) {
			t.Errorf("gedcom missing %q", want)
		}
	}
	if n := strings.Count(ged, "1 FAMC "); n < 3 {
		t.Errorf("gedcom has %d FAMC lines, want Nenek in two families and Paman/A One under Mbah", n)
	}

	// Copying Nenek with her ancestors to another tree keeps the kind of each link.
	dest := newTreeFor(t, alice, "Copy")
	if res := call(t, alice, "POST", "/api/trees/"+dest+"/import", importBody(treeA, "p-nenek", "ancestors", nil)); res.Status != 201 {
		t.Fatalf("copy: %d %v", res.Status, res.Body)
	}
	var copied []string
	DB.Table("relationships").Where("tree_id = ? AND type = 'parent' AND deleted_at IS NULL", dest).Pluck("COALESCE(kind, 'birth')", &copied)
	sort.Strings(copied)
	if strings.Join(copied, ",") != "adopted,birth,birth,birth,foster" { // Nenek's four parents, and Mbah > Paman
		t.Errorf("copied parent kinds = %v", copied)
	}

	// A cross-tree person fails the whole change: the valid link in the same request is not written either.
	exec(`INSERT INTO people (id, tree_id, name, status, gender) VALUES ('p-other', ?, 'Other', 'alive', 'male')`, treeB)
	if res := rels("p-gp", []map[string]any{{"to": "p-aunt", "type": "parent", "kind": "step"}, {"to": "p-other", "type": "parent"}}); res.Status != 400 {
		t.Errorf("cross-tree: %d %v", res.Status, res.Body)
	}
	var n int64
	DB.Table("relationships").Where("from_id = 'p-gp' AND to_id = 'p-aunt' AND deleted_at IS NULL").Count(&n)
	if n != 0 {
		t.Error("a valid link was written although the request failed")
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
