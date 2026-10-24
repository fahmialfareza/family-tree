// Command mongo2pg copies family-tree data from MongoDB into Postgres.
//
// One-off cutover tool: it truncates the Postgres tables (trees included) and reloads everything into a
// single tree, so it is safe to re-run.
// Existing MongoDB ObjectIDs are kept as text primary keys. Delete this command after the cutover.
//
// Env: MONGO_URI, MONGO_DB (default "family-tree"), DATABASE_URL.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	app "github.com/fahmialfareza/family-tree/backend/internal"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"gorm.io/gorm"
)

// Local mirrors of the app row types (column names match internal/schema.go).
type Base struct {
	ID        string
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt
}

type user struct {
	Base
	Name, Username, Password, Role string
}

type person struct {
	Base
	TreeID                                  string
	Name, Nickname, Address, Status, Gender string
	BirthDate                               *time.Time
	Phone, PhotoURL                         string
}

type family struct {
	Base
	TreeID   string
	Name     string
	PersonID *string
}

type relationship struct {
	Base
	TreeID             string
	FromID, ToID, Type string
	SortOrder          int
}

type tree struct {
	ID, Name     string
	CreatedBy    *string
	BranchScoped bool
}

type treeMember struct{ TreeID, UserID, Role string }

type personOwner struct{ PersonID, UserID string }
type familyOwner struct{ FamilyID, UserID string }

func main() {
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		log.Fatal("MONGO_URI is required")
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		dbName = "family-tree"
	}
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatalf("mongo connect: %v", err)
	}
	defer client.Disconnect(context.Background())
	mdb := client.Database(dbName)

	if err := app.InitPostgres(ctx); err != nil {
		log.Fatalf("postgres: %v", err)
	}
	if err := app.InitSchema(ctx); err != nil {
		log.Fatalf("schema: %v", err)
	}

	users := load(ctx, mdb, "users")
	people := load(ctx, mdb, "people")
	families := load(ctx, mdb, "families")
	rels := load(ctx, mdb, "relationships")

	// Everything lands in one branch-scoped tree, matching migration 00002.
	treeID := uuid.Must(uuid.NewV7()).String()
	tRow := tree{ID: treeID, Name: app.DefaultFamilyTreeName, BranchScoped: true}
	var tmRows []treeMember

	userIDs := map[string]bool{}
	personIDs := map[string]bool{}
	var (
		uRows  []user
		pRows  []person
		poRows []personOwner
		fRows  []family
		foRows []familyOwner
		rRows  []relationship
	)
	skipped := map[string]int{}

	for _, d := range users {
		u := user{Base: baseOf(d), Name: str(d["name"]), Username: str(d["username"]), Password: str(d["password"]), Role: str(d["role"])}
		if u.Role == "" {
			u.Role = "user"
		}
		userIDs[u.ID] = true
		uRows = append(uRows, u)
		if u.DeletedAt.Valid {
			continue
		}
		role := app.TreeRoleEditor
		if u.Role == "admin" {
			role = app.TreeRoleOwner
			if tRow.CreatedBy == nil {
				id := u.ID
				tRow.CreatedBy = &id
			}
		}
		tmRows = append(tmRows, treeMember{TreeID: treeID, UserID: u.ID, Role: string(role)})
	}
	for _, d := range people {
		p := person{
			Base: baseOf(d), TreeID: treeID, Name: str(d["name"]), Nickname: str(d["nickname"]), Address: str(d["address"]),
			Status: str(d["status"]), Gender: str(d["gender"]), BirthDate: timeOf(d["birthDate"]),
			Phone: str(d["phone"]), PhotoURL: str(d["photoUrl"]),
		}
		personIDs[p.ID] = true
		pRows = append(pRows, p)
		for _, uid := range uniq(idList(d["ownedBy"])) {
			if !userIDs[uid] {
				skipped["person_owners (missing user)"]++
				continue
			}
			poRows = append(poRows, personOwner{PersonID: p.ID, UserID: uid})
		}
	}
	for _, d := range families {
		f := family{Base: baseOf(d), TreeID: treeID, Name: str(d["name"])}
		if pid := idOf(d["person"]); pid != "" {
			if personIDs[pid] {
				f.PersonID = &pid
			} else {
				skipped["families.person_id (missing person, set NULL)"]++
			}
		}
		fRows = append(fRows, f)
		for _, uid := range uniq(idList(d["ownedBy"])) {
			if !userIDs[uid] {
				skipped["family_owners (missing user)"]++
				continue
			}
			foRows = append(foRows, familyOwner{FamilyID: f.ID, UserID: uid})
		}
	}
	for _, d := range rels {
		r := relationship{Base: baseOf(d), TreeID: treeID, FromID: idOf(d["from"]), ToID: idOf(d["to"]), Type: str(d["type"]), SortOrder: intOf(d["order"])}
		if !personIDs[r.FromID] || !personIDs[r.ToID] {
			skipped["relationships (missing person)"]++
			continue
		}
		rRows = append(rRows, r)
	}

	err = app.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("TRUNCATE relationships, family_owners, families, person_owners, people, tree_invites, tree_members, trees, users CASCADE").Error; err != nil {
			return err
		}
		steps := []struct {
			table string
			rows  any
			n     int
		}{
			{"users", uRows, len(uRows)},
			{"trees", []tree{tRow}, 1},
			{"tree_members", tmRows, len(tmRows)},
			{"people", pRows, len(pRows)},
			{"person_owners", poRows, len(poRows)},
			{"families", fRows, len(fRows)},
			{"family_owners", foRows, len(foRows)},
			{"relationships", rRows, len(rRows)},
		}
		for _, s := range steps {
			if s.n == 0 {
				continue
			}
			if err := tx.Table(s.table).CreateInBatches(s.rows, 500).Error; err != nil {
				return fmt.Errorf("insert %s: %w", s.table, err)
			}
		}
		return nil
	})
	if err != nil {
		log.Fatalf("migration failed, nothing written: %v", err)
	}

	fmt.Println("\ncollection/table      mongo  postgres")
	report := func(name string, mongoCount int, table string) {
		var n int64
		app.DB.WithContext(ctx).Table(table).Count(&n)
		fmt.Printf("%-20s %6d %9d\n", name, mongoCount, n)
	}
	report("users", len(users), "users")
	report("people", len(people), "people")
	report("families", len(families), "families")
	report("relationships", len(rels), "relationships")
	fmt.Printf("%-20s %6s %9d\n", "person_owners", "-", len(poRows))
	fmt.Printf("%-20s %6s %9d\n", "family_owners", "-", len(foRows))
	for k, v := range skipped {
		fmt.Printf("skipped %s: %d\n", k, v)
	}
}

// load reads every document, including soft-deleted ones (they become rows with deleted_at set).
func load(ctx context.Context, db *mongo.Database, name string) []bson.M {
	cur, err := db.Collection(name).Find(ctx, bson.M{})
	if err != nil {
		log.Fatalf("read %s: %v", name, err)
	}
	var docs []bson.M
	if err := cur.All(ctx, &docs); err != nil {
		log.Fatalf("decode %s: %v", name, err)
	}
	return docs
}

func baseOf(d bson.M) Base {
	b := Base{ID: idOf(d["_id"])}
	if t := timeOf(d["createdAt"]); t != nil {
		b.CreatedAt = *t
	}
	if t := timeOf(d["updatedAt"]); t != nil {
		b.UpdatedAt = *t
	}
	if del, _ := d["deleted"].(bool); del {
		t := timeOf(d["deletedAt"])
		if t == nil {
			now := time.Now()
			t = &now
		}
		b.DeletedAt = gorm.DeletedAt{Time: *t, Valid: true}
	}
	return b
}

func idOf(v any) string {
	switch x := v.(type) {
	case primitive.ObjectID:
		return x.Hex()
	case string:
		return x
	}
	return ""
}

func idList(v any) []string {
	arr, _ := v.(primitive.A)
	out := make([]string, 0, len(arr))
	for _, it := range arr {
		if id := idOf(it); id != "" {
			out = append(out, id)
		}
	}
	return out
}

func uniq(ids []string) []string {
	seen := map[string]bool{}
	out := ids[:0]
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func intOf(v any) int {
	switch x := v.(type) {
	case int32:
		return int(x)
	case int64:
		return int(x)
	case float64:
		return int(x)
	}
	return 0
}

// timeOf accepts BSON dates and RFC3339 / YYYY-MM-DD strings.
func timeOf(v any) *time.Time {
	var t time.Time
	switch x := v.(type) {
	case primitive.DateTime:
		t = x.Time()
	case time.Time:
		t = x
	case string:
		var err error
		if t, err = time.Parse(time.RFC3339, x); err != nil {
			if t, err = time.Parse("2006-01-02", x); err != nil {
				return nil
			}
		}
	default:
		return nil
	}
	if t.IsZero() {
		return nil
	}
	t = t.UTC()
	return &t
}
