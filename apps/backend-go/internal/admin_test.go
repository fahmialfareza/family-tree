package app

import "testing"

func TestAdminOverview(t *testing.T) {
	resetDB(t)
	expectStatus(t, "", 401, []routeCase{{"GET", "/api/admin/overview", nil}})
	// Tree owners are not platform admins.
	expectStatus(t, alice, 403, []routeCase{{"GET", "/api/admin/overview", nil}})

	DB.Exec("UPDATE users SET role = 'admin' WHERE id = ?", alice)
	DB.Exec("UPDATE users SET created_at = now() WHERE created_at IS NULL") // the app always sets it; fixtures do not
	res := call(t, alice, "GET", "/api/admin/overview", nil)
	if res.Status != 200 {
		t.Fatalf("admin: %d %v", res.Status, res.Body)
	}
	d := res.data().(map[string]any)
	users := d["users"].(map[string]any)
	trees := d["trees"].(map[string]any)
	content := d["content"].(map[string]any)
	if users["total"] != float64(5) || trees["total"] != float64(2) || content["people"] != float64(3) || content["families"] != float64(2) {
		t.Errorf("counts: users=%v trees=%v content=%v", users, trees, content)
	}
	if users["active1d"].(float64) < 1 { // the admin's own session from this request
		t.Errorf("active users: %v", users)
	}
	for _, key := range []string{"signups", "peopleAdded"} {
		days := d[key].([]any)
		if len(days) != adminDays {
			t.Fatalf("%s: %d days", key, len(days))
		}
		var total float64
		for _, day := range days {
			total += day.(map[string]any)["count"].(float64)
		}
		want := float64(5)
		if key == "peopleAdded" {
			want = 3
		}
		if total != want {
			t.Errorf("%s total %v, want %v", key, total, want)
		}
	}
	if n := len(d["recentUsers"].([]any)); n != 5 {
		t.Errorf("recent users: %d", n)
	}
	largest := d["largestTrees"].([]any)
	if len(largest) != 2 || largest[0].(map[string]any)["people"] != float64(2) {
		t.Errorf("largest trees: %v", largest)
	}
	sys := d["system"].(map[string]any)
	if sys["database"] != "ok" {
		t.Errorf("system: %v", sys)
	}
}
