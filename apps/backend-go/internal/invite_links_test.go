package app

import "testing"

func TestInviteLinks(t *testing.T) {
	resetDB(t)
	base := "/api/trees/" + treeA + "/invite-links"

	// Only owners manage links; links never make owners; expiry is 1, 7 or 30 days.
	expectStatus(t, bob, 403, []routeCase{{"POST", base, map[string]any{"role": "editor", "days": 7}}})
	expectStatus(t, alice, 400, []routeCase{
		{"POST", base, map[string]any{"role": "owner", "days": 7}},
		{"POST", base, map[string]any{"role": "viewer", "days": 3}},
	})
	res := call(t, alice, "POST", base, map[string]any{"role": "viewer", "days": 7})
	if res.Status != 201 {
		t.Fatalf("create: %d %v", res.Status, res.Body)
	}
	token := str(dataMap(res), "token")
	linkID := str(dataMap(res)["link"].(map[string]any), "_id")

	// Anyone can preview a live link (tree name, inviter, role), without signing in.
	prev := call(t, "", "GET", "/api/invites/preview?token="+token, nil)
	if prev.Status != 200 || str(dataMap(prev), "kind") != "link" || str(dataMap(prev), "treeName") != "A" || str(dataMap(prev), "role") != "viewer" {
		t.Fatalf("preview: %d %v", prev.Status, prev.Body)
	}
	expectStatus(t, "", 410, []routeCase{{"GET", "/api/invites/preview?token=nope", nil}})

	// Many accounts can join with one link, no matching email needed (carol, erin have none).
	for _, u := range []string{carol, erin} {
		if r := call(t, u, "POST", "/api/invites/accept", map[string]any{"token": token}); r.Status != 200 || str(dataMap(r), "role") != "viewer" {
			t.Fatalf("%s accept: %d %v", u, r.Status, r.Body)
		}
	}
	expectStatus(t, carol, 409, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": token}}})
	list := call(t, alice, "GET", base, nil).list()
	if len(list) != 1 || list[0].(map[string]any)["uses"] != float64(2) {
		t.Errorf("list: %v", list)
	}

	// Expired and revoked links stop working.
	expired := str(dataMap(call(t, alice, "POST", base, map[string]any{"role": "editor", "days": 1})), "token")
	DB.Exec("UPDATE tree_invite_links SET expires_at = now() - interval '1 minute' WHERE token_hash = ?", hashInviteToken(expired))
	DB.Exec("DELETE FROM tree_members WHERE tree_id = ? AND user_id = ?", treeA, erin)
	expectStatus(t, erin, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": expired}}})
	expectStatus(t, alice, 200, []routeCase{{"DELETE", base + "/" + linkID, nil}})
	expectStatus(t, erin, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": token}}})
	expectStatus(t, "", 410, []routeCase{{"GET", "/api/invites/preview?token=" + token, nil}})

	// A link dies when its creator stops being an owner.
	fresh := str(dataMap(call(t, alice, "POST", base, map[string]any{"role": "editor", "days": 30})), "token")
	DB.Exec("UPDATE tree_members SET role = 'editor' WHERE tree_id = ? AND user_id = ?", treeA, alice)
	expectStatus(t, erin, 410, []routeCase{{"POST", "/api/invites/accept", map[string]any{"token": fresh}}})
}
