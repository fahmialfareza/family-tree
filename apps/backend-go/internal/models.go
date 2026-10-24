package app

import "time"

type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

type User struct {
	ID       string   `json:"_id"`
	Name     string   `json:"name"`
	Username string   `json:"username"`
	Password string   `json:"password,omitempty"`
	Role     UserRole `json:"role"`
}

type TreeRole string

const (
	TreeRoleOwner  TreeRole = "owner"
	TreeRoleEditor TreeRole = "editor"
	TreeRoleViewer TreeRole = "viewer"
)

// DefaultFamilyTreeName names the tree that pre-workspace data was moved into.
const DefaultFamilyTreeName = "Alfareza Family"

type Tree struct {
	ID           string    `json:"_id"`
	Name         string    `json:"name"`
	BranchScoped bool      `json:"branchScoped"`
	Role         TreeRole  `json:"role,omitempty"` // the caller's role in this tree
	CreatedAt    time.Time `json:"createdAt"`
}

type TreeMember struct {
	UserID   string    `json:"userId"`
	Name     string    `json:"name"`
	Username string    `json:"username,omitempty"`
	Email    string    `json:"email,omitempty"`
	Role     TreeRole  `json:"role"`
	JoinedAt time.Time `json:"joinedAt"`
}

type TreeInvite struct {
	ID        string    `json:"_id"`
	TreeID    string    `json:"treeId"`
	Email     string    `json:"email"`
	Role      TreeRole  `json:"role"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

type Person struct {
	ID            string          `json:"_id"`
	TreeID        string          `json:"treeId,omitempty"`
	Name          string          `json:"name"`
	Nickname      string          `json:"nickname"`
	Address       string          `json:"address"`
	Status        string          `json:"status"`
	Gender        string          `json:"gender"`
	BirthDate     time.Time       `json:"birthDate"`
	Phone         string          `json:"phone,omitempty"`
	PhotoURL      string          `json:"photoUrl,omitempty"`
	OwnedBy       []string        `json:"ownedBy"`
	Owners        []User          `json:"owners,omitempty"`
	Relationships []*Relationship `json:"relationships,omitempty"`
}

type Family struct {
	ID      string   `json:"_id"`
	TreeID  string   `json:"treeId,omitempty"`
	Name    string   `json:"name"`
	Person  *Person  `json:"person,omitempty"`
	OwnedBy []string `json:"ownedBy"`
}

type Relationship struct {
	ID          string  `json:"_id"`
	From        string  `json:"from"`
	To          string  `json:"to"`
	Type        string  `json:"type"`
	Order       int     `json:"order,omitempty"`
	ToDetails   *Person `json:"toDetails,omitempty"`
	FromDetails *Person `json:"fromDetails,omitempty"`
}
