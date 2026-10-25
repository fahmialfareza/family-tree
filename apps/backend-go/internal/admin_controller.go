package app

import (
	"context"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// Platform overview for the operator (users.role = admin): counts, growth, activity and system health.
// Aggregates only, plus the newest accounts for support; no family data (people, notes, places) is
// returned. Days are counted in Asia/Jakarta, where the operator and most families are.

const adminDays = 30

type dayCount struct {
	Date  string `json:"date"` // YYYY-MM-DD, Asia/Jakarta
	Count int64  `json:"count"`
}

type adminUser struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Email         string     `json:"email,omitempty"`
	Username      string     `json:"username,omitempty"`
	EmailVerified bool       `json:"emailVerified"`
	SignIn        string     `json:"signIn"` // google | apple | password
	Trees         int64      `json:"trees"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastActiveAt  *time.Time `json:"lastActiveAt,omitempty"`
}

type adminTree struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	People    int64     `json:"people"`
	Members   int64     `json:"members"`
	Assistant bool      `json:"assistant"`
	CreatedAt time.Time `json:"createdAt"`
}

type adminOverview struct {
	GeneratedAt time.Time `json:"generatedAt"`
	Users       struct {
		Total     int64 `json:"total"`
		Verified  int64 `json:"verified"`
		Pending   int64 `json:"pending"`
		Google    int64 `json:"google"`
		Apple     int64 `json:"apple"`
		New7d     int64 `json:"new7d"`
		New30d    int64 `json:"new30d"`
		Prev30d   int64 `json:"prev30d"`
		Active1d  int64 `json:"active1d"`
		Active7d  int64 `json:"active7d"`
		Active30d int64 `json:"active30d"`
	} `json:"users"`
	Trees struct {
		Total            int64 `json:"total"`
		AssistantEnabled int64 `json:"assistantEnabled"`
		BranchScoped     int64 `json:"branchScoped"`
		New30d           int64 `json:"new30d"`
	} `json:"trees"`
	Content struct {
		People        int64 `json:"people"`
		Families      int64 `json:"families"`
		Relationships int64 `json:"relationships"`
		Photos        int64 `json:"photos"`
		PeopleNew30d  int64 `json:"peopleNew30d"`
	} `json:"content"`
	Signups      []dayCount  `json:"signups"`
	PeopleAdded  []dayCount  `json:"peopleAdded"`
	RecentUsers  []adminUser `json:"recentUsers"`
	LargestTrees []adminTree `json:"largestTrees"`
	System       struct {
		Database    string   `json:"database"` // ok | error
		Redis       string   `json:"redis"`    // ok | error | off
		Email       bool     `json:"email"`
		Google      bool     `json:"google"`
		Apple       bool     `json:"apple"`
		AIProviders []string `json:"aiProviders"`
		Version     string   `json:"version,omitempty"`
	} `json:"system"`
}

// dailyCounts returns one row per day for the last adminDays days (zeros included) from table.created_at.
func dailyCounts(ctx context.Context, table string) ([]dayCount, error) {
	var rows []dayCount
	err := DB.WithContext(ctx).Raw(`
		WITH days AS (
			SELECT generate_series(
				(now() AT TIME ZONE 'Asia/Jakarta')::date - (? - 1),
				(now() AT TIME ZONE 'Asia/Jakarta')::date,
				interval '1 day')::date AS d
		)
		SELECT to_char(days.d, 'YYYY-MM-DD') AS date, count(t.id) AS count
		FROM days
		LEFT JOIN `+table+` t ON (t.created_at AT TIME ZONE 'Asia/Jakarta')::date = days.d AND t.deleted_at IS NULL
		GROUP BY days.d ORDER BY days.d`, adminDays).Scan(&rows).Error
	return rows, err
}

func adminOverviewHandler(c *gin.Context) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("handler/adminOverview").End()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	db := DB.WithContext(ctx)

	var out adminOverview
	out.GeneratedAt = time.Now()
	steps := []func() error{
		func() error {
			return db.Raw(`SELECT
				count(*) AS total,
				count(*) FILTER (WHERE email_verified_at IS NOT NULL) AS verified,
				count(*) FILTER (WHERE email IS NOT NULL AND email_verified_at IS NULL) AS pending,
				count(*) FILTER (WHERE google_sub IS NOT NULL) AS google,
				count(*) FILTER (WHERE apple_sub IS NOT NULL) AS apple,
				count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS new7d,
				count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new30d,
				count(*) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS prev30d
				FROM users WHERE deleted_at IS NULL`).Scan(&out.Users).Error
		},
		func() error {
			var a struct{ Active1d, Active7d, Active30d int64 }
			err := db.Raw(`SELECT
				count(DISTINCT user_id) FILTER (WHERE last_used_at >= now() - interval '1 day') AS active1d,
				count(DISTINCT user_id) FILTER (WHERE last_used_at >= now() - interval '7 days') AS active7d,
				count(DISTINCT user_id) AS active30d
				FROM sessions WHERE last_used_at >= now() - interval '30 days'`).Scan(&a).Error
			out.Users.Active1d, out.Users.Active7d, out.Users.Active30d = a.Active1d, a.Active7d, a.Active30d
			return err
		},
		func() error {
			return db.Raw(`SELECT count(*) AS total,
				count(*) FILTER (WHERE assistant_enabled) AS assistant_enabled,
				count(*) FILTER (WHERE branch_scoped) AS branch_scoped,
				count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new30d
				FROM trees WHERE deleted_at IS NULL`).Scan(&out.Trees).Error
		},
		func() error {
			return db.Raw(`SELECT
				(SELECT count(*) FROM people WHERE deleted_at IS NULL) AS people,
				(SELECT count(*) FROM families WHERE deleted_at IS NULL) AS families,
				(SELECT count(*) FROM relationships WHERE deleted_at IS NULL) AS relationships,
				(SELECT count(*) FROM people WHERE deleted_at IS NULL AND photo_url <> '') AS photos,
				(SELECT count(*) FROM people WHERE deleted_at IS NULL AND created_at >= now() - interval '30 days') AS people_new30d`).
				Scan(&out.Content).Error
		},
		func() (err error) { out.Signups, err = dailyCounts(ctx, "users"); return },
		func() (err error) { out.PeopleAdded, err = dailyCounts(ctx, "people"); return },
		func() error {
			var rows []struct {
				ID           string
				Name         string
				Email        *string
				Username     *string
				GoogleSub    *string
				AppleSub     *string
				VerifiedAt   *time.Time
				CreatedAt    time.Time
				Trees        int64
				LastActiveAt *time.Time
			}
			err := db.Raw(`SELECT u.id, u.name, u.email, u.username, u.google_sub, u.apple_sub,
					u.email_verified_at AS verified_at, u.created_at,
					(SELECT count(*) FROM tree_members m JOIN trees t ON t.id = m.tree_id AND t.deleted_at IS NULL WHERE m.user_id = u.id) AS trees,
					(SELECT max(s.last_used_at) FROM sessions s WHERE s.user_id = u.id) AS last_active_at
				FROM users u WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 10`).Scan(&rows).Error
			out.RecentUsers = make([]adminUser, 0, len(rows))
			for _, r := range rows {
				u := adminUser{ID: r.ID, Name: r.Name, Email: deref(r.Email), Username: deref(r.Username),
					EmailVerified: r.VerifiedAt != nil, SignIn: "password", Trees: r.Trees, CreatedAt: r.CreatedAt, LastActiveAt: r.LastActiveAt}
				if r.GoogleSub != nil {
					u.SignIn = "google"
				} else if r.AppleSub != nil {
					u.SignIn = "apple"
				}
				out.RecentUsers = append(out.RecentUsers, u)
			}
			return err
		},
		func() error {
			out.LargestTrees = []adminTree{}
			return db.Raw(`SELECT t.id, t.name, t.assistant_enabled AS assistant, t.created_at,
					(SELECT count(*) FROM people p WHERE p.tree_id = t.id AND p.deleted_at IS NULL) AS people,
					(SELECT count(*) FROM tree_members m WHERE m.tree_id = t.id) AS members
				FROM trees t WHERE t.deleted_at IS NULL ORDER BY people DESC, t.created_at LIMIT 5`).Scan(&out.LargestTrees).Error
		},
	}
	for _, step := range steps {
		if err := step(); err != nil {
			abortServerError(c, err)
			return
		}
	}

	out.System.Database = "ok"
	out.System.Redis = "off"
	if RedisClient != nil {
		out.System.Redis = "ok"
		if err := RedisClient.Ping(ctx).Err(); err != nil {
			out.System.Redis = "error"
		}
	}
	out.System.Email = os.Getenv("RESEND_API_KEY") != ""
	out.System.Google = googleEnabled()
	out.System.Apple = appleEnabled()
	out.System.AIProviders = []string{}
	for _, p := range aiProviders() {
		out.System.AIProviders = append(out.System.AIProviders, p.Name)
	}
	if v := os.Getenv("RAILWAY_GIT_COMMIT_SHA"); len(v) >= 7 {
		out.System.Version = v[:7]
	}
	c.Header("Cache-Control", "no-store")
	responseSuccess(c, out, 200)
}
