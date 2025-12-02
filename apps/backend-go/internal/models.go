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

type Person struct {
	ID            string          `json:"_id"`
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
