package app

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Postgres row types. API structs in models.go stay unchanged; these map to/from them.
// IDs are text so migrated MongoDB hex IDs keep working; new rows get UUIDv7 strings.

type RowBase struct {
	ID        string `gorm:"primaryKey;type:text"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (b *RowBase) BeforeCreate(tx *gorm.DB) error {
	if b.ID == "" {
		b.ID = uuid.Must(uuid.NewV7()).String()
	}
	return nil
}

// Tables and indexes are defined by the SQL files in internal/migrations; gorm tags here only describe mappings.

type userRow struct {
	RowBase
	Name            string
	Username        *string
	Password        string
	Role            string
	Email           *string
	EmailVerifiedAt *time.Time
	GoogleSub       *string
	AppleSub        *string
}

func (userRow) TableName() string { return "users" }

type treeRow struct {
	RowBase
	Name             string
	CreatedBy        *string `gorm:"type:text"`
	BranchScoped     bool
	AssistantEnabled bool
}

func (treeRow) TableName() string { return "trees" }

type treeInviteRow struct {
	ID         string `gorm:"primaryKey;type:text"`
	TreeID     string `gorm:"type:text"`
	Email      string
	Role       string
	TokenHash  string
	InvitedBy  *string `gorm:"type:text"`
	ExpiresAt  time.Time
	AcceptedAt *time.Time
	RevokedAt  *time.Time
	CreatedAt  time.Time
}

func (treeInviteRow) TableName() string { return "tree_invites" }

func (r *treeInviteRow) toModel() *TreeInvite {
	return &TreeInvite{ID: r.ID, TreeID: r.TreeID, Email: r.Email, Role: TreeRole(r.Role), ExpiresAt: r.ExpiresAt, CreatedAt: r.CreatedAt}
}

type treeMemberRow struct {
	TreeID    string `gorm:"primaryKey;type:text"`
	UserID    string `gorm:"primaryKey;type:text"`
	Role      string
	CreatedAt time.Time
}

func (treeMemberRow) TableName() string { return "tree_members" }

type personRow struct {
	RowBase
	TreeID    string `gorm:"type:text"`
	Name      string
	Nickname  string
	Address   string
	Status    string
	Gender    string
	BirthDate *time.Time
	// Partial dates and details (migration 00004); NULL when unknown.
	BirthDatePrecision *string
	BirthDateQualifier *string
	DeathDate          *time.Time
	DeathDatePrecision *string
	DeathDateQualifier *string
	BirthPlace         *string
	DeathPlace         *string
	Notes              *string
	// Set on people copied from another tree (migration 00005); never sent to clients.
	SourcePersonID *string `gorm:"type:text"`
	Phone          string
	PhotoURL       string
	OwnerLinks     []personOwner     `gorm:"foreignKey:PersonID;constraint:OnDelete:CASCADE"`
	Relationships  []relationshipRow `gorm:"foreignKey:FromID"`
}

func (personRow) TableName() string { return "people" }

type personOwner struct {
	PersonID string   `gorm:"primaryKey;type:text"`
	UserID   string   `gorm:"primaryKey;type:text;index"`
	Owner    *userRow `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (personOwner) TableName() string { return "person_owners" }

type familyRow struct {
	RowBase
	TreeID     string `gorm:"type:text"`
	Name       string
	PersonID   *string       `gorm:"type:text;index"`
	Person     *personRow    `gorm:"foreignKey:PersonID"`
	OwnerLinks []familyOwner `gorm:"foreignKey:FamilyID;constraint:OnDelete:CASCADE"`
}

func (familyRow) TableName() string { return "families" }

type familyOwner struct {
	FamilyID string   `gorm:"primaryKey;type:text"`
	UserID   string   `gorm:"primaryKey;type:text;index"`
	Owner    *userRow `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (familyOwner) TableName() string { return "family_owners" }

type relationshipRow struct {
	RowBase
	TreeID    string     `gorm:"type:text"`
	FromID    string     `gorm:"type:text"`
	ToID      string     `gorm:"type:text"`
	From      *personRow `gorm:"foreignKey:FromID"`
	To        *personRow `gorm:"foreignKey:ToID"`
	Type      string
	SortOrder int
}

func (relationshipRow) TableName() string { return "relationships" }

func (u *userRow) toModel() *User {
	out := &User{
		ID:            u.ID,
		Name:          u.Name,
		Password:      u.Password,
		Role:          UserRole(u.Role),
		EmailVerified: u.EmailVerifiedAt != nil,
		HasPassword:   u.Password != "",
		GoogleLinked:  u.GoogleSub != nil,
		AppleLinked:   u.AppleSub != nil,
	}
	if u.Username != nil {
		out.Username = *u.Username
	}
	if u.Email != nil {
		out.Email = *u.Email
		// Emails only change after verification, so an unverified one marks a signup that is not complete.
		out.Pending = u.EmailVerifiedAt == nil
	}
	return out
}

// toModel maps the person row; owners and relationships are filled only when preloaded.
func (p *personRow) toModel() *Person {
	out := &Person{
		ID:       p.ID,
		TreeID:   p.TreeID,
		Name:     p.Name,
		Nickname: p.Nickname,
		Address:  p.Address,
		Status:   p.Status,
		Gender:   p.Gender,
		Phone:    p.Phone,
		PhotoURL: p.PhotoURL,
		OwnedBy:  []string{},
	}
	// pgx returns timestamptz in the server's local zone; dates are periods anchored in UTC.
	if p.BirthDate != nil {
		out.BirthDate = p.BirthDate.UTC()
	}
	if p.DeathDate != nil {
		dd := p.DeathDate.UTC()
		out.DeathDate = &dd
	}
	out.BirthDatePrecision = deref(p.BirthDatePrecision)
	out.BirthDateQualifier = deref(p.BirthDateQualifier)
	out.DeathDatePrecision = deref(p.DeathDatePrecision)
	out.DeathDateQualifier = deref(p.DeathDateQualifier)
	out.BirthPlace = deref(p.BirthPlace)
	out.DeathPlace = deref(p.DeathPlace)
	out.Notes = deref(p.Notes)
	for _, l := range p.OwnerLinks {
		out.OwnedBy = append(out.OwnedBy, l.UserID)
		if l.Owner != nil {
			if out.Owners == nil {
				out.Owners = []User{}
			}
			u := l.Owner.toModel()
			u.Password = ""
			out.Owners = append(out.Owners, *u)
		}
	}
	for i := range p.Relationships {
		out.Relationships = append(out.Relationships, p.Relationships[i].toModel())
	}
	return out
}

func newPersonRow(p *Person) *personRow {
	row := &personRow{
		RowBase:  RowBase{ID: p.ID},
		TreeID:   p.TreeID,
		Name:     p.Name,
		Nickname: p.Nickname,
		Address:  p.Address,
		Status:   p.Status,
		Gender:   p.Gender,
		Phone:    p.Phone,
		PhotoURL: p.PhotoURL,

		BirthDatePrecision: nullable(p.BirthDatePrecision),
		BirthDateQualifier: nullable(p.BirthDateQualifier),
		DeathDatePrecision: nullable(p.DeathDatePrecision),
		DeathDateQualifier: nullable(p.DeathDateQualifier),
		BirthPlace:         nullable(p.BirthPlace),
		DeathPlace:         nullable(p.DeathPlace),
		Notes:              nullable(p.Notes),
	}
	if !p.BirthDate.IsZero() {
		bd := p.BirthDate
		row.BirthDate = &bd
	}
	if p.DeathDate != nil && !p.DeathDate.IsZero() {
		dd := *p.DeathDate
		row.DeathDate = &dd
	}
	return row
}

// nullable maps "" to NULL for optional text columns.
func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (f *familyRow) toModel() *Family {
	out := &Family{ID: f.ID, TreeID: f.TreeID, Name: f.Name, OwnedBy: []string{}}
	if f.Person != nil {
		out.Person = f.Person.toModel()
		out.Person.OwnedBy = nil
	}
	for _, l := range f.OwnerLinks {
		out.OwnedBy = append(out.OwnedBy, l.UserID)
	}
	return out
}

func (r *relationshipRow) toModel() *Relationship {
	out := &Relationship{ID: r.ID, From: r.FromID, To: r.ToID, Type: r.Type, Order: r.SortOrder}
	if r.From != nil {
		out.FromDetails = r.From.toModel()
		out.FromDetails.OwnedBy = nil
	}
	if r.To != nil {
		out.ToDetails = r.To.toModel()
		out.ToDetails.OwnedBy = nil
	}
	return out
}

func personOwnerRows(personIDs, userIDs []string) []personOwner {
	rows := make([]personOwner, 0, len(personIDs)*len(userIDs))
	for _, pid := range personIDs {
		for _, uid := range dedupe(userIDs) {
			rows = append(rows, personOwner{PersonID: pid, UserID: uid})
		}
	}
	return rows
}

func familyOwnerRows(familyID string, userIDs []string) []familyOwner {
	rows := make([]familyOwner, 0, len(userIDs))
	for _, uid := range dedupe(userIDs) {
		rows = append(rows, familyOwner{FamilyID: familyID, UserID: uid})
	}
	return rows
}

func dedupe(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
