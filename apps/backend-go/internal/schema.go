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
	Username        string
	Password        string
	Role            string
	Email           *string
	EmailVerifiedAt *time.Time
	GoogleSub       *string
}

func (userRow) TableName() string { return "users" }

type treeRow struct {
	RowBase
	Name         string
	CreatedBy    *string `gorm:"type:text"`
	BranchScoped bool
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
	TreeID        string `gorm:"type:text"`
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
	return &User{ID: u.ID, Name: u.Name, Username: u.Username, Password: u.Password, Role: UserRole(u.Role)}
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
		TreeID:   p.TreeID,
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
