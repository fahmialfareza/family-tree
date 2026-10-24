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

type userRow struct {
	RowBase
	Name     string
	Username string `gorm:"uniqueIndex:idx_users_username_active,where:deleted_at IS NULL"`
	Password string
	Role     string
}

func (userRow) TableName() string { return "users" }

type personRow struct {
	RowBase
	Name          string
	Nickname      string
	Address       string
	Status        string
	Gender        string
	BirthDate     *time.Time
	Phone         string
	PhotoURL      string
	OwnerLinks    []personOwner     `gorm:"foreignKey:PersonID;constraint:OnDelete:CASCADE"`
	Relationships []relationshipRow `gorm:"foreignKey:FromID"`
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
	FromID    string     `gorm:"type:text;not null;index"`
	ToID      string     `gorm:"type:text;not null;index"`
	From      *personRow `gorm:"foreignKey:FromID"`
	To        *personRow `gorm:"foreignKey:ToID"`
	Type      string
	SortOrder int
}

func (relationshipRow) TableName() string { return "relationships" }

// schemaModels lists every table managed by AutoMigrate, in dependency order.
var schemaModels = []any{
	&userRow{}, &personRow{}, &personOwner{}, &familyRow{}, &familyOwner{}, &relationshipRow{},
}

func (u *userRow) toModel() *User {
	return &User{ID: u.ID, Name: u.Name, Username: u.Username, Password: u.Password, Role: UserRole(u.Role)}
}

// toModel maps the person row; owners and relationships are filled only when preloaded.
func (p *personRow) toModel() *Person {
	out := &Person{
		ID:       p.ID,
		Name:     p.Name,
		Nickname: p.Nickname,
		Address:  p.Address,
		Status:   p.Status,
		Gender:   p.Gender,
		Phone:    p.Phone,
		PhotoURL: p.PhotoURL,
		OwnedBy:  []string{},
	}
	if p.BirthDate != nil {
		out.BirthDate = *p.BirthDate
	}
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
		Name:     p.Name,
		Nickname: p.Nickname,
		Address:  p.Address,
		Status:   p.Status,
		Gender:   p.Gender,
		Phone:    p.Phone,
		PhotoURL: p.PhotoURL,
	}
	if !p.BirthDate.IsZero() {
		bd := p.BirthDate
		row.BirthDate = &bd
	}
	return row
}

func (f *familyRow) toModel() *Family {
	out := &Family{ID: f.ID, Name: f.Name, OwnedBy: []string{}}
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
