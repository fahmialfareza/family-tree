package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// These tests need a disposable Postgres database: TEST_DATABASE_URL=postgres://.../family_tree_test
// They truncate every table, so the database name must contain "test".
// Set TEST_REDIS_URL as well to run them through the Redis cache.

var testRouter *gin.Engine

func TestMain(m *testing.M) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		fmt.Println("skipping database tests: TEST_DATABASE_URL is not set")
		os.Exit(0)
	}
	if !strings.Contains(dsn[strings.LastIndex(dsn, "/"):], "test") {
		fmt.Println("refusing to run: TEST_DATABASE_URL database name must contain \"test\"")
		os.Exit(1)
	}
	os.Setenv("DATABASE_URL", dsn)
	jwtSecret = []byte("test-secret")
	ctx := context.Background()
	if err := InitPostgres(ctx); err != nil {
		fmt.Println("postgres:", err)
		os.Exit(1)
	}
	if err := InitSchema(ctx); err != nil {
		fmt.Println("schema:", err)
		os.Exit(1)
	}
	if redisURL := os.Getenv("TEST_REDIS_URL"); redisURL != "" {
		os.Setenv("REDIS_URL", redisURL)
		InitRedis(ctx)
	}
	gin.SetMode(gin.TestMode)
	testRouter = gin.New()
	RegisterRoutes(testRouter)
	os.Exit(m.Run())
}

// Fixture IDs. Tree A is branch-scoped: alice owns it, bob is an editor who owns pA1/fA1, dave is a viewer.
// Tree B is open (not branch-scoped): carol owns it, erin is an editor.
const (
	alice, bob, carol, dave, erin = "u-alice", "u-bob", "u-carol", "u-dave", "u-erin"
	treeA, treeB                  = "t-a", "t-b"
	pA1, pA2, pB1                 = "p-a1", "p-a2", "p-b1"
	fA1, fA2                      = "f-a1", "f-a2"
)

func resetDB(t *testing.T) {
	t.Helper()
	exec := func(sql string, args ...any) {
		t.Helper()
		if err := DB.Exec(sql, args...).Error; err != nil {
			t.Fatalf("seed %q: %v", sql, err)
		}
	}
	exec("TRUNCATE relationships, family_owners, families, person_owners, people, tree_invites, tree_members, trees, users CASCADE")
	// Fixture IDs repeat across tests, so drop anything a previous test cached for them.
	bumpTreeCache(context.Background(), treeA)
	bumpTreeCache(context.Background(), treeB)
	for _, u := range []string{alice, bob, carol, dave, erin} {
		cacheDel(context.Background(), cacheKeyUser(u), cacheKeyUsername(u))
	}
	for _, u := range []string{alice, bob, carol, dave, erin} {
		exec("INSERT INTO users (id, name, username, password, role) VALUES (?, ?, ?, 'x', 'user')", u, u, u)
	}
	exec("INSERT INTO trees (id, name, branch_scoped) VALUES (?, 'A', true), (?, 'B', false)", treeA, treeB)
	exec(`INSERT INTO tree_members (tree_id, user_id, role) VALUES
		(?, ?, 'owner'), (?, ?, 'editor'), (?, ?, 'viewer'), (?, ?, 'owner'), (?, ?, 'editor')`,
		treeA, alice, treeA, bob, treeA, dave, treeB, carol, treeB, erin)
	exec(`INSERT INTO people (id, tree_id, name, nickname, address, status, gender, created_at) VALUES
		(?, ?, 'A One', 'a1', 'x', 'alive', 'male', now()),
		(?, ?, 'A Two', 'a2', 'x', 'alive', 'female', now() + interval '1 second'),
		(?, ?, 'B One', 'b1', 'x', 'alive', 'male', now())`, pA1, treeA, pA2, treeA, pB1, treeB)
	exec("INSERT INTO person_owners (person_id, user_id) VALUES (?, ?), (?, ?), (?, ?)", pA1, bob, pA2, alice, pB1, carol)
	exec(`INSERT INTO relationships (id, tree_id, from_id, to_id, type, sort_order) VALUES
		('r1', ?, ?, ?, 'spouse', 0), ('r2', ?, ?, ?, 'spouse', 0)`, treeA, pA1, pA2, treeA, pA2, pA1)
	exec("INSERT INTO families (id, tree_id, name, person_id) VALUES (?, ?, 'FA1', ?), (?, ?, 'FA2', ?)", fA1, treeA, pA1, fA2, treeA, pA2)
	exec("INSERT INTO family_owners (family_id, user_id) VALUES (?, ?), (?, ?)", fA1, bob, fA2, alice)
}

func tokenFor(t *testing.T, userID string) string {
	t.Helper()
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"id": userID, "exp": time.Now().Add(time.Hour).Unix()}).SignedString(jwtSecret)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

type response struct {
	Status int
	Body   map[string]any
}

func (r response) data() any { return r.Body["data"] }

func (r response) list() []any {
	l, _ := r.data().([]any)
	return l
}

func ids(items []any) []string {
	out := []string{}
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			out = append(out, fmt.Sprint(m["_id"]))
		}
	}
	return out
}

// call sends JSON bodies as JSON and url.Values-like maps (form) as multipart, like the frontend.
func call(t *testing.T, user, method, path string, body any) response {
	t.Helper()
	var buf bytes.Buffer
	contentType := ""
	switch b := body.(type) {
	case nil:
	case form:
		w := multipart.NewWriter(&buf)
		for k, v := range b {
			_ = w.WriteField(k, v)
		}
		w.Close()
		contentType = w.FormDataContentType()
	default:
		if err := json.NewEncoder(&buf).Encode(b); err != nil {
			t.Fatal(err)
		}
		contentType = "application/json"
	}
	req := httptest.NewRequest(method, path, &buf)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if user != "" {
		req.Header.Set("Authorization", "Bearer "+tokenFor(t, user))
	}
	rec := httptest.NewRecorder()
	testRouter.ServeHTTP(rec, req)
	out := response{Status: rec.Code}
	_ = json.Unmarshal(rec.Body.Bytes(), &out.Body)
	return out
}

type form map[string]string

var personForm = form{"name": "Edited", "nickname": "ed", "address": "x", "status": "alive", "gender": "male"}

type routeCase struct {
	method, path string
	body         any
}

func expectStatus(t *testing.T, user string, want int, cases []routeCase) {
	t.Helper()
	for _, rc := range cases {
		if got := call(t, user, rc.method, rc.path, rc.body); got.Status != want {
			t.Errorf("%s %s %s: got %d, want %d (%v)", user, rc.method, rc.path, got.Status, want, got.Body)
		}
	}
}

func personExists(t *testing.T, id string) bool {
	t.Helper()
	var n int64
	DB.Model(&personRow{}).Where("id = ?", id).Count(&n)
	return n == 1
}

func TestNonMembersGet404(t *testing.T) {
	resetDB(t)
	// carol (owner of tree B) must not reach anything in tree A, through legacy or tree-scoped routes.
	expectStatus(t, carol, 404, []routeCase{
		{"GET", "/api/person/" + pA1, nil},
		{"PUT", "/api/person/" + pA1, personForm},
		{"DELETE", "/api/person/" + pA1, nil},
		{"PUT", "/api/person/" + pA1 + "/ownership", map[string]any{"owners": []string{carol}}},
		{"GET", "/api/relationship/" + pA1, nil},
		{"POST", "/api/relationship/" + pA1, []map[string]any{{"to": pA2, "type": "child"}}},
		{"GET", "/api/tree/" + pA1 + "?mode=parent", nil},
		{"DELETE", "/api/family/" + fA1, nil},
		{"GET", "/api/trees/" + treeA, nil},
		{"PATCH", "/api/trees/" + treeA, map[string]any{"name": "pwned"}},
		{"DELETE", "/api/trees/" + treeA, nil},
		{"GET", "/api/trees/" + treeA + "/members", nil},
		{"GET", "/api/trees/" + treeA + "/invites", nil},
		{"POST", "/api/trees/" + treeA + "/invites", map[string]any{"email": "c@example.com", "role": "owner"}},
		{"GET", "/api/trees/" + treeA + "/people", nil},
		{"POST", "/api/trees/" + treeA + "/people", personForm},
		{"GET", "/api/trees/" + treeA + "/people/" + pA1, nil},
		{"GET", "/api/trees/" + treeA + "/people/" + pA1 + "/tree", nil},
		{"GET", "/api/trees/" + treeA + "/families", nil},
		// Smuggling a tree-A ID through carol's own tree B must not work either.
		{"GET", "/api/trees/" + treeB + "/people/" + pA1, nil},
		{"PUT", "/api/trees/" + treeB + "/people/" + pA1, personForm},
		{"DELETE", "/api/trees/" + treeB + "/people/" + pA1, nil},
		{"PUT", "/api/trees/" + treeB + "/people/" + pA1 + "/ownership", map[string]any{"owners": []string{carol}}},
		{"GET", "/api/trees/" + treeB + "/people/" + pA1 + "/relationships", nil},
		{"GET", "/api/trees/" + treeB + "/people/" + pA1 + "/tree", nil},
		{"DELETE", "/api/trees/" + treeB + "/families/" + fA1, nil},
	})
	// Linking a tree-B person to a tree-A person is rejected.
	if got := call(t, carol, "POST", "/api/trees/"+treeB+"/people/"+pB1+"/relationships", []map[string]any{{"to": pA1, "type": "spouse"}}); got.Status != 400 {
		t.Errorf("cross-tree relationship: got %d, want 400", got.Status)
	}
	if !personExists(t, pA1) || !personExists(t, pA2) {
		t.Fatal("tree A data was modified by a non-member")
	}
	var crossRels int64
	DB.Model(&relationshipRow{}).Where("from_id = ? OR to_id = ?", pB1, pB1).Count(&crossRels)
	if crossRels != 0 {
		t.Errorf("cross-tree relationships written: %d", crossRels)
	}
	// Unauthenticated requests are rejected before any tree lookup.
	if got := call(t, "", "GET", "/api/trees/"+treeA, nil); got.Status != 401 {
		t.Errorf("anonymous: got %d, want 401", got.Status)
	}
}

func TestBranchScopedEditor(t *testing.T) {
	resetDB(t)
	// Lists only show bob's branch; reading anything in the tree still works (the tree view depends on it).
	if got := ids(call(t, bob, "GET", "/api/person", nil).list()); strings.Join(got, ",") != pA1 {
		t.Errorf("bob's people list = %v, want [%s]", got, pA1)
	}
	if got := ids(call(t, bob, "GET", "/api/family", nil).list()); strings.Join(got, ",") != fA1 {
		t.Errorf("bob's family list = %v, want [%s]", got, fA1)
	}
	expectStatus(t, bob, 200, []routeCase{
		{"GET", "/api/person/" + pA2, nil},
		{"GET", "/api/relationship/" + pA2, nil},
		{"GET", "/api/tree/" + pA2 + "?mode=parent", nil},
		{"GET", "/api/trees/" + treeA + "/people/" + pA2 + "/tree?mode=child", nil},
		{"GET", "/api/trees/" + treeA + "/members", nil},
		{"PUT", "/api/person/" + pA1, personForm},
	})
	// Not bob's branch, or owner-only. Relationships live on both people, so touching pA2's side is refused
	// too: re-saving the existing spouse link, or dropping it with an empty list.
	expectStatus(t, bob, 403, []routeCase{
		{"POST", "/api/relationship/" + pA1, []map[string]any{{"to": pA2, "type": "spouse"}}},
		{"POST", "/api/relationship/" + pA1, []map[string]any{}},
		{"PUT", "/api/person/" + pA2, personForm},
		{"DELETE", "/api/person/" + pA2, nil},
		{"POST", "/api/relationship/" + pA2, []map[string]any{{"to": pA1, "type": "spouse"}}},
		{"DELETE", "/api/family/" + fA2, nil},
		{"POST", "/api/family", map[string]any{"name": "x", "person": pA2}},
		{"PUT", "/api/person/" + pA1 + "/ownership", map[string]any{"owners": []string{bob}}},
		{"GET", "/api/auth/users", nil},
		{"PATCH", "/api/trees/" + treeA, map[string]any{"branchScoped": false}},
		{"GET", "/api/trees/" + treeA + "/invites", nil},
		{"PATCH", "/api/trees/" + treeA + "/members/" + bob, map[string]any{"role": "owner"}},
		{"DELETE", "/api/trees/" + treeA + "/members/" + dave, nil},
	})
	// A person bob creates through the legacy route lands in tree A and is his to edit.
	created := call(t, bob, "POST", "/api/person", form{"name": "New", "nickname": "n", "address": "x", "status": "alive", "gender": "female"})
	m, _ := created.data().(map[string]any)
	if created.Status != 200 || m["treeId"] != treeA {
		t.Fatalf("create person: %d %v", created.Status, created.Body)
	}
	newID := fmt.Sprint(m["_id"])
	expectStatus(t, bob, 200, []routeCase{{"PUT", "/api/person/" + newID, personForm}})
	// Linking two people of his own branch works.
	expectStatus(t, bob, 201, []routeCase{{"POST", "/api/relationship/" + newID, []map[string]any{{"to": pA1, "type": "parent"}}}})
	var spouseLinks int64
	DB.Model(&relationshipRow{}).Where("id IN ('r1', 'r2')").Count(&spouseLinks)
	if spouseLinks != 2 {
		t.Errorf("spouse links outside bob's branch were changed: %d left", spouseLinks)
	}
}

func TestViewerIsReadOnly(t *testing.T) {
	resetDB(t)
	expectStatus(t, dave, 200, []routeCase{
		{"GET", "/api/person/" + pA1, nil},
		{"GET", "/api/tree/" + pA1 + "?mode=parent", nil},
		{"GET", "/api/trees/" + treeA, nil},
	})
	if got := call(t, dave, "GET", "/api/person", nil).list(); len(got) != 0 {
		t.Errorf("viewer without shared branch should list nothing, got %v", ids(got))
	}
	expectStatus(t, dave, 403, []routeCase{
		{"POST", "/api/person", personForm},
		{"PUT", "/api/person/" + pA1, personForm},
		{"DELETE", "/api/person/" + pA1, nil},
		{"POST", "/api/relationship/" + pA1, []map[string]any{{"to": pA2, "type": "spouse"}}},
		{"POST", "/api/trees/" + treeA + "/families", map[string]any{"name": "x", "person": pA1}},
		{"DELETE", "/api/family/" + fA1, nil},
	})
}

func TestOwnerAndBranchSharing(t *testing.T) {
	resetDB(t)
	if got := ids(call(t, alice, "GET", "/api/person", nil).list()); len(got) != 2 {
		t.Errorf("owner should list the whole tree, got %v", got)
	}
	expectStatus(t, alice, 200, []routeCase{{"PUT", "/api/person/" + pA1, personForm}})
	var bobStillOwns int64
	DB.Model(&personOwner{}).Where("person_id = ? AND user_id = ?", pA1, bob).Count(&bobStillOwns)
	if bobStillOwns != 1 {
		t.Error("editing a person changed its owners")
	}
	// Owners must be tree members.
	expectStatus(t, alice, 400, []routeCase{{"PUT", "/api/person/" + pA2 + "/ownership", map[string]any{"owners": []string{alice, carol}}}})
	// Sharing pA2 with bob also shares the spouse link, so bob's list grows to both people.
	expectStatus(t, alice, 200, []routeCase{{"PUT", "/api/person/" + pA2 + "/ownership", map[string]any{"owners": []string{alice, bob}}}})
	if got := ids(call(t, bob, "GET", "/api/person", nil).list()); len(got) != 2 {
		t.Errorf("after sharing, bob should list 2 people, got %v", got)
	}
	expectStatus(t, bob, 200, []routeCase{{"PUT", "/api/person/" + pA2, personForm}})
	// The legacy owner picker lists the other members of the tree only.
	users := ids(call(t, alice, "GET", "/api/auth/users", nil).list())
	if strings.Join(users, ",") != bob+","+dave && strings.Join(users, ",") != dave+","+bob {
		t.Errorf("owner picker = %v, want bob and dave", users)
	}
}

func TestMemberEmailsVisibleToOwnersOnly(t *testing.T) {
	resetDB(t)
	DB.Exec("UPDATE users SET email = 'bob@example.com' WHERE id = ?", bob)
	emails := func(user string) []string {
		out := []string{}
		for _, it := range call(t, user, "GET", "/api/trees/"+treeA+"/members", nil).list() {
			if e := fmt.Sprint(it.(map[string]any)["email"]); e != "<nil>" && e != "" {
				out = append(out, e)
			}
		}
		return out
	}
	if got := emails(alice); len(got) != 1 {
		t.Errorf("owner should see member emails, got %v", got)
	}
	if got := emails(dave); len(got) != 0 {
		t.Errorf("viewer should not see member emails, got %v", got)
	}
}

func TestLegacyCreateUserOnlyJoinsOwnedTree(t *testing.T) {
	resetDB(t)
	// dave is a platform admin but only a viewer in tree A: his new accounts must not join tree A.
	DB.Exec("UPDATE users SET role = 'admin' WHERE id IN (?, ?)", dave, alice)
	if got := call(t, dave, "POST", "/api/auth", map[string]any{"name": "Alt", "username": "dave-alt", "password": "pw-123456"}); got.Status != 201 {
		t.Fatalf("create user: %d %v", got.Status, got.Body)
	}
	var joined int64
	DB.Table("tree_members").Joins("JOIN users ON users.id = tree_members.user_id").Where("users.username = 'dave-alt'").Count(&joined)
	if joined != 0 {
		t.Error("account created by a viewer-admin joined the tree")
	}
	// alice owns tree A, so her new accounts join it as editors.
	call(t, alice, "POST", "/api/auth", map[string]any{"name": "Kid", "username": "alice-kid", "password": "pw-123456"})
	var role string
	DB.Table("tree_members").Select("tree_members.role").Joins("JOIN users ON users.id = tree_members.user_id").
		Where("users.username = 'alice-kid' AND tree_members.tree_id = ?", treeA).Scan(&role)
	if role != "editor" {
		t.Errorf("owner-admin's new account role = %q, want editor", role)
	}
}

func TestOpenTreeEditorCanEditEverything(t *testing.T) {
	resetDB(t)
	if got := ids(call(t, erin, "GET", "/api/person", nil).list()); strings.Join(got, ",") != pB1 {
		t.Errorf("erin's list = %v, want [%s]", got, pB1)
	}
	expectStatus(t, erin, 200, []routeCase{{"PUT", "/api/trees/" + treeB + "/people/" + pB1, personForm}})
}

func TestTreesMembersAndInvites(t *testing.T) {
	resetDB(t)

	// Anyone can create a tree and becomes its owner.
	created := call(t, carol, "POST", "/api/trees", map[string]any{"name": "  Carol's second  "})
	tree, _ := created.data().(map[string]any)
	if created.Status != 201 || tree["role"] != "owner" || tree["name"] != "Carol's second" {
		t.Fatalf("create tree: %d %v", created.Status, created.Body)
	}
	if got := call(t, carol, "GET", "/api/trees", nil).list(); len(got) != 2 {
		t.Errorf("carol should see 2 trees, got %d", len(got))
	}
	expectStatus(t, carol, 400, []routeCase{{"POST", "/api/trees", map[string]any{"name": " "}}})

	// The last owner can neither leave nor be demoted.
	expectStatus(t, alice, 409, []routeCase{
		{"DELETE", "/api/trees/" + treeA + "/members/" + alice, nil},
		{"PATCH", "/api/trees/" + treeA + "/members/" + alice, map[string]any{"role": "editor"}},
	})

	// Invite erin to tree A as a viewer; the token is single-use.
	inv := call(t, alice, "POST", "/api/trees/"+treeA+"/invites", map[string]any{"email": "Erin@Example.com", "role": "viewer"})
	payload, _ := inv.data().(map[string]any)
	token, _ := payload["token"].(string)
	if inv.Status != 201 || token == "" {
		t.Fatalf("create invite: %d %v", inv.Status, inv.Body)
	}
	if got := call(t, alice, "GET", "/api/trees/"+treeA+"/invites", nil).list(); len(got) != 1 {
		t.Errorf("pending invites = %d, want 1", len(got))
	}
	// The token alone is not enough: accounts without a matching email are refused.
	expectStatus(t, erin, 403, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": token}}})
	DB.Exec("UPDATE users SET email = 'erin@example.com' WHERE id = ?", erin)
	accepted := call(t, erin, "POST", "/api/invites/accept", map[string]any{"token": token})
	if accepted.Status != 200 {
		t.Fatalf("accept invite: %d %v", accepted.Status, accepted.Body)
	}
	expectStatus(t, erin, 200, []routeCase{{"GET", "/api/trees/" + treeA + "/people/" + pA1, nil}})
	expectStatus(t, erin, 403, []routeCase{{"PUT", "/api/trees/" + treeA + "/people/" + pA1, personForm}})
	expectStatus(t, carol, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": token}}})
	expectStatus(t, carol, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": "not-a-real-token"}}})

	// Users can only accept invites sent to their own address.
	DB.Exec("UPDATE users SET email = 'carol@example.com' WHERE id = ?", carol)
	inv2 := call(t, alice, "POST", "/api/trees/"+treeA+"/invites", map[string]any{"email": "someone@example.com", "role": "editor"})
	payload2, _ := inv2.data().(map[string]any)
	expectStatus(t, carol, 403, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": payload2["token"]}}})

	// Revoked invites cannot be accepted.
	invite2, _ := payload2["invite"].(map[string]any)
	expectStatus(t, alice, 200, []routeCase{{"DELETE", fmt.Sprintf("/api/trees/%s/invites/%v", treeA, invite2["_id"]), nil}})
	DB.Exec("UPDATE users SET email = 'someone@example.com' WHERE id = ?", carol)
	expectStatus(t, carol, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": payload2["token"]}}})

	// Invites die with their inviter's ownership: a co-owner's owner-invite stops working once they are removed.
	expectStatus(t, alice, 200, []routeCase{{"PATCH", "/api/trees/" + treeA + "/members/" + dave, map[string]any{"role": "owner"}}})
	inv3 := call(t, dave, "POST", "/api/trees/"+treeA+"/invites", map[string]any{"email": "someone@example.com", "role": "owner"})
	payload3, _ := inv3.data().(map[string]any)
	expectStatus(t, alice, 200, []routeCase{{"DELETE", "/api/trees/" + treeA + "/members/" + dave, nil}})
	expectStatus(t, carol, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": payload3["token"]}}})
	// Same when the inviter is merely demoted, even if the invite row were somehow still pending.
	DB.Exec("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, ?, 'owner')", treeA, dave)
	inv4 := call(t, dave, "POST", "/api/trees/"+treeA+"/invites", map[string]any{"email": "someone@example.com", "role": "owner"})
	payload4, _ := inv4.data().(map[string]any)
	DB.Exec("UPDATE tree_members SET role = 'viewer' WHERE tree_id = ? AND user_id = ?", treeA, dave)
	expectStatus(t, carol, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": payload4["token"]}}})
	DB.Exec("UPDATE users SET email = NULL WHERE id = ?", carol)

	// A member can leave; their branch shares in that tree go with them.
	expectStatus(t, bob, 200, []routeCase{{"DELETE", "/api/trees/" + treeA + "/members/" + bob, nil}})
	expectStatus(t, bob, 404, []routeCase{{"GET", "/api/person/" + pA1, nil}})
	var shares int64
	DB.Model(&personOwner{}).Where("user_id = ?", bob).Count(&shares)
	if shares != 0 {
		t.Errorf("bob still owns %d people after leaving", shares)
	}

	// A soft-deleted co-owner does not count: alice is still the last live owner.
	DB.Exec("UPDATE tree_members SET role = 'owner' WHERE tree_id = ? AND user_id = ?", treeA, erin)
	DB.Exec("UPDATE users SET deleted_at = now() WHERE id = ?", erin)
	expectStatus(t, alice, 409, []routeCase{{"DELETE", "/api/trees/" + treeA + "/members/" + alice, nil}})
	DB.Exec("UPDATE users SET deleted_at = NULL WHERE id = ?", erin)
	DB.Exec("UPDATE tree_members SET role = 'viewer' WHERE tree_id = ? AND user_id = ?", treeA, erin)

	// Promote dave, then alice may step down; deleting the tree locks everyone out.
	expectStatus(t, alice, 200, []routeCase{
		{"PATCH", "/api/trees/" + treeA + "/members/" + dave, map[string]any{"role": "owner"}},
		{"PATCH", "/api/trees/" + treeA + "/members/" + alice, map[string]any{"role": "viewer"}},
	})
	expectStatus(t, dave, 200, []routeCase{{"DELETE", "/api/trees/" + treeA, nil}})
	expectStatus(t, dave, 404, []routeCase{{"GET", "/api/trees/" + treeA, nil}})
	expectStatus(t, alice, 404, []routeCase{{"GET", "/api/person/" + pA1, nil}})
}
