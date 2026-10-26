package app

import "testing"

func TestAdminOverview(t *testing.T) {
	resetDB(t)
	expectStatus(t, "", 401, []routeCase{{"GET", "/api/admin/overview", nil}})
	// Tree owners are not platform admins.
	expectStatus(t, alice, 403, []routeCase{{"GET", "/api/admin/overview", nil}})

	DB.Exec("UPDATE users SET role = 'admin' WHERE id = ?", alice)
	// The app always sets created_at; fixtures do not. Two accounts are old: one in the prior month, one a year ago.
	DB.Exec("UPDATE users SET created_at = now() WHERE created_at IS NULL")
	DB.Exec("UPDATE users SET created_at = now() - interval '40 days' WHERE id = ?", dave)
	DB.Exec("UPDATE users SET created_at = now() - interval '400 days' WHERE id = ?", erin)
	expectStatus(t, alice, 400, []routeCase{{"GET", "/api/admin/overview?period=2w", nil}})

	get := func(period string) map[string]any {
		t.Helper()
		res := call(t, alice, "GET", "/api/admin/overview?period="+period, nil)
		if res.Status != 200 {
			t.Fatalf("%s: %d %v", period, res.Status, res.Body)
		}
		return res.data().(map[string]any)
	}
	sum := func(series []any) (total float64) {
		for _, b := range series {
			total += b.(map[string]any)["count"].(float64)
		}
		return
	}
	for _, tc := range []struct {
		period  string
		buckets int // 0 = don't check
		bucket  string
		users   float64
		prior   any
	}{
		{"7d", 7, "day", 3, float64(0)},
		{"1m", 30, "day", 3, float64(1)}, // dave joined 40 days ago: the month before
		{"3m", 0, "week", 4, float64(0)},
		{"1y", 0, "month", 4, float64(1)}, // erin, 400 days ago
		{"all", 0, "month", 5, nil},
	} {
		d := get(tc.period)
		p := d["period"].(map[string]any)
		in := d["inPeriod"].(map[string]any)["users"].(map[string]any)
		if p["bucket"] != tc.bucket || in["count"] != tc.users || in["prior"] != tc.prior {
			t.Errorf("%s: period=%v users=%v", tc.period, p, in)
		}
		if signups := d["signups"].([]any); (tc.buckets > 0 && len(signups) != tc.buckets) || sum(signups) != tc.users {
			t.Errorf("%s: %d buckets summing to %v, want %d / %v", tc.period, len(signups), sum(signups), tc.buckets, tc.users)
		}
	}

	d := get("1m")
	if d["users"].(map[string]any)["total"] != float64(5) || d["trees"].(map[string]any)["total"] != float64(2) ||
		d["content"].(map[string]any)["people"] != float64(3) || d["inPeriod"].(map[string]any)["activeUsers"].(float64) < 1 {
		t.Errorf("totals: %v %v %v %v", d["users"], d["trees"], d["content"], d["inPeriod"])
	}
	if n := len(d["recentUsers"].([]any)); n != 5 {
		t.Errorf("recent users: %d", n)
	}
	if largest := d["largestTrees"].([]any); len(largest) != 2 || largest[0].(map[string]any)["people"] != float64(2) {
		t.Errorf("largest trees: %v", largest)
	}
	if d["system"].(map[string]any)["database"] != "ok" {
		t.Errorf("system: %v", d["system"])
	}
}
