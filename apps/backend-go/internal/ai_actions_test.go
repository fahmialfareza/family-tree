package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func runnerFor(t *testing.T, user string) *toolRunner {
	t.Helper()
	ctx := context.Background()
	access, err := loadTreeAccess(ctx, treeA, user)
	if err != nil {
		t.Fatal(err)
	}
	data, err := loadAITree(ctx, treeA)
	if err != nil {
		t.Fatal(err)
	}
	return newToolRunner(ctx, buildAIIndex(data), access)
}

// propose runs a write tool and returns the stored action, or the error message.
func propose(t *testing.T, r *toolRunner, tool string, args map[string]any) (*assistantAction, string) {
	t.Helper()
	b, _ := json.Marshal(args)
	var res map[string]any
	if err := json.Unmarshal([]byte(r.run(tool, string(b))), &res); err != nil {
		t.Fatal(err)
	}
	if msg, ok := res["error"].(string); ok {
		return nil, msg
	}
	if res["proposed"] != true {
		t.Fatalf("%s: unexpected result %v", tool, res)
	}
	return &r.actions[len(r.actions)-1], ""
}

func TestAssistantWriteProposals(t *testing.T) {
	resetDB(t)

	// Viewers get no write tools, and calling one anyway is refused.
	viewer := runnerFor(t, dave)
	if len(viewer.tools()) != len(assistantTools) {
		t.Errorf("viewer offered %d tools", len(viewer.tools()))
	}
	if _, msg := propose(t, viewer, "propose_add_person", map[string]any{"name": "X"}); !strings.Contains(msg, "only view") {
		t.Errorf("viewer proposal: %q", msg)
	}

	owner := runnerFor(t, alice)
	if len(owner.tools()) != len(assistantTools)+len(assistantWriteTools) {
		t.Errorf("owner offered %d tools", len(owner.tools()))
	}

	// A child with both parents, approximate birth year.
	act, msg := propose(t, owner, "propose_add_person", map[string]any{
		"name": "  Child One ", "relative_id": pA1, "relation": "child", "other_parent_id": pA2,
		"birth_date": "2001", "birth_date_qualifier": "about", "birth_place": "Malang",
	})
	if msg != "" || act.ID != "a1" || act.Type != "add_person" || *act.Fields.Name != "Child One" ||
		act.RelativeName != "A One" || act.OtherParentName != "A Two" || *act.Fields.BirthDateQualifier != "about" {
		t.Fatalf("add child: %+v %q", act, msg)
	}
	// A death date marks the person deceased.
	if act, msg := propose(t, owner, "propose_add_person", map[string]any{"name": "Old One", "death_date": "1990-05-02"}); msg != "" || *act.Fields.Status != "deceased" {
		t.Errorf("death implies deceased: %+v %q", act, msg)
	}

	future := time.Now().AddDate(1, 0, 0).Format("2006")
	for name, args := range map[string]map[string]any{
		"no name":                   {"nickname": "x"},
		"bad month":                 {"name": "X", "birth_date": "2001-13"},
		"future date":               {"name": "X", "birth_date": future},
		"bad gender":                {"name": "X", "gender": "robot"},
		"bad qualifier":             {"name": "X", "birth_date": "2001", "birth_date_qualifier": "maybe"},
		"bad relation":              {"name": "X", "relative_id": pA1, "relation": "sibling"},
		"unknown relative":          {"name": "X", "relative_id": "nope", "relation": "child"},
		"other parent, not a child": {"name": "X", "relative_id": pA1, "relation": "parent", "other_parent_id": pA2},
		"other tree":                {"name": "X", "relative_id": pB1, "relation": "child"},
	} {
		if _, msg := propose(t, owner, "propose_add_person", args); msg == "" {
			t.Errorf("%s: accepted", name)
		}
	}

	// Updates send only what changes; ids must exist.
	if act, msg := propose(t, owner, "propose_update_person", map[string]any{"id": pA2, "address": "Jl. Baru 1"}); msg != "" ||
		act.PersonName != "A Two" || *act.Fields.Address != "Jl. Baru 1" || act.Fields.Name != nil {
		t.Errorf("update: %+v %q", act, msg)
	}
	if _, msg := propose(t, owner, "propose_update_person", map[string]any{"id": pA2}); msg == "" {
		t.Error("empty update accepted")
	}

	// Relationships: no duplicates, no self links.
	if _, msg := propose(t, owner, "propose_add_relationship", map[string]any{"person_id": pA1, "relative_id": pA2, "relation": "partner"}); !strings.Contains(msg, "already") {
		t.Errorf("duplicate partner link: %q", msg)
	}
	if _, msg := propose(t, owner, "propose_add_relationship", map[string]any{"person_id": pA1, "relative_id": pA1, "relation": "parent"}); msg == "" {
		t.Error("self link accepted")
	}
	if act, msg := propose(t, owner, "propose_add_relationship", map[string]any{"person_id": pA1, "relative_id": pA2, "relation": "parent"}); msg != "" || act.Relation != "parent" {
		t.Errorf("parent link: %+v %q", act, msg)
	}

	// Families: create and rename (ids from list_families).
	var fams struct {
		Families []struct{ ID, Name string } `json:"families"`
	}
	_ = json.Unmarshal([]byte(owner.run("list_families", "{}")), &fams)
	if len(fams.Families) != 2 {
		t.Fatalf("list_families: %+v", fams)
	}
	if act, msg := propose(t, owner, "propose_add_family", map[string]any{"name": "Bani One", "person_id": pA1}); msg != "" || act.FamilyName != "Bani One" {
		t.Errorf("add family: %+v %q", act, msg)
	}
	if act, msg := propose(t, owner, "propose_rename_family", map[string]any{"family_id": fA1, "name": "Keluarga Satu"}); msg != "" || act.FamilyID != fA1 {
		t.Errorf("rename family: %+v %q", act, msg)
	}
	if _, msg := propose(t, owner, "propose_rename_family", map[string]any{"family_id": "nope", "name": "X"}); msg == "" {
		t.Error("unknown family accepted")
	}

	// Branch-scoped editors may only touch their own branch (bob owns pA1 and fA1).
	editor := runnerFor(t, bob)
	if _, msg := propose(t, editor, "propose_update_person", map[string]any{"id": pA1, "nickname": "one"}); msg != "" {
		t.Errorf("editor on own branch: %q", msg)
	}
	if _, msg := propose(t, editor, "propose_update_person", map[string]any{"id": pA2, "nickname": "two"}); !strings.Contains(msg, "may not edit") {
		t.Errorf("editor outside branch: %q", msg)
	}
	if _, msg := propose(t, editor, "propose_rename_family", map[string]any{"family_id": fA2, "name": "X"}); msg == "" {
		t.Error("editor renamed a family outside the branch")
	}

	// At most maxAssistantActions per answer.
	busy := runnerFor(t, alice)
	for i := 0; i < maxAssistantActions; i++ {
		if _, msg := propose(t, busy, "propose_add_person", map[string]any{"name": "P"}); msg != "" {
			t.Fatal(msg)
		}
	}
	if _, msg := propose(t, busy, "propose_add_person", map[string]any{"name": "P"}); !strings.Contains(msg, "at most") {
		t.Errorf("limit: %q", msg)
	}
}

func TestRenameFamily(t *testing.T) {
	resetDB(t)
	path := func(id string) string { return "/api/trees/" + treeA + "/families/" + id }
	if res := call(t, alice, "PATCH", path(fA1), map[string]any{"name": "  Bani One  "}); res.Status != 200 || res.data().(map[string]any)["name"] != "Bani One" {
		t.Fatalf("owner rename: %d %v", res.Status, res.Body)
	}
	expectStatus(t, alice, 400, []routeCase{{"PATCH", path(fA1), map[string]any{"name": " "}}})
	expectStatus(t, alice, 404, []routeCase{{"PATCH", path("nope"), map[string]any{"name": "X"}}})
	expectStatus(t, bob, 200, []routeCase{{"PATCH", path(fA1), map[string]any{"name": "Mine"}}})
	expectStatus(t, bob, 403, []routeCase{{"PATCH", path(fA2), map[string]any{"name": "Not mine"}}})
	expectStatus(t, dave, 403, []routeCase{{"PATCH", path(fA1), map[string]any{"name": "Viewer"}}})
	expectStatus(t, carol, 404, []routeCase{{"PATCH", path(fA1), map[string]any{"name": "Outsider"}}})
}
