package app

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// The assistant can also change the tree, but never by itself: write tools only *propose* an action, which
// is validated here (ids exist in this tree, the asker may edit them, fields are valid) and returned to the
// client. The user applies each action with a button; the client then calls the regular API endpoints, so
// every change goes through the same permission checks and validation as the forms. Nothing a model reads
// (for example text planted in someone's notes) can change data without a person clicking Apply.
// Deleting is deliberately not offered.

const maxAssistantActions = 10

// assistantAction is one proposed change, shaped for the client to apply.
type assistantAction struct {
	ID   string `json:"id"`
	Type string `json:"type"` // add_person | update_person | add_relationship | add_family | rename_family
	// The person the action is about (update_person, add_relationship, add_family).
	PersonID   string `json:"personId,omitempty"`
	PersonName string `json:"personName,omitempty"`
	// add_person / add_relationship: the person becomes RelativeName's <relation> (parent | child | partner).
	RelativeID   string `json:"relativeId,omitempty"`
	RelativeName string `json:"relativeName,omitempty"`
	Relation     string `json:"relation,omitempty"`
	// add_person as a child: the other parent, if known.
	OtherParentID   string `json:"otherParentId,omitempty"`
	OtherParentName string `json:"otherParentName,omitempty"`
	// add_family / rename_family.
	FamilyID   string `json:"familyId,omitempty"`
	FamilyName string `json:"familyName,omitempty"`
	// add_person / update_person: the fields to set (update: only the ones that change).
	Fields *personFields `json:"fields,omitempty"`
}

// personFields mirrors the person form; nil means "not set / unchanged". Dates are YYYY, YYYY-MM or
// YYYY-MM-DD with an optional qualifier (exact, about, before, after).
type personFields struct {
	Name               *string `json:"name,omitempty"`
	Nickname           *string `json:"nickname,omitempty"`
	Gender             *string `json:"gender,omitempty"`
	Status             *string `json:"status,omitempty"`
	BirthDate          *string `json:"birthDate,omitempty"`
	BirthDateQualifier *string `json:"birthDateQualifier,omitempty"`
	BirthPlace         *string `json:"birthPlace,omitempty"`
	DeathDate          *string `json:"deathDate,omitempty"`
	DeathDateQualifier *string `json:"deathDateQualifier,omitempty"`
	DeathPlace         *string `json:"deathPlace,omitempty"`
	Address            *string `json:"address,omitempty"`
	Notes              *string `json:"notes,omitempty"`
}

// fieldArgs are the person fields as the model sends them (snake_case, all optional).
type fieldArgs struct {
	Name               *string `json:"name"`
	Nickname           *string `json:"nickname"`
	Gender             *string `json:"gender"`
	Status             *string `json:"status"`
	BirthDate          *string `json:"birth_date"`
	BirthDateQualifier *string `json:"birth_date_qualifier"`
	BirthPlace         *string `json:"birth_place"`
	DeathDate          *string `json:"death_date"`
	DeathDateQualifier *string `json:"death_date_qualifier"`
	DeathPlace         *string `json:"death_place"`
	Address            *string `json:"address"`
	Notes              *string `json:"notes"`
}

var actionDatePattern = regexp.MustCompile(`^\d{4}(-\d{2}(-\d{2})?)?$`)

func validActionDate(s string) bool {
	if !actionDatePattern.MatchString(s) {
		return false
	}
	layout := map[int]string{4: "2006", 7: "2006-01", 10: "2006-01-02"}[len(s)]
	t, err := time.Parse(layout, s)
	return err == nil && t.Year() >= 1 && t.Before(time.Now().AddDate(0, 0, 1))
}

// toFields validates the model's arguments; requireName is true for new people.
func (a fieldArgs) toFields(requireName bool) (*personFields, string) {
	trim := func(p *string) *string {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		return &v
	}
	f := &personFields{
		Name: trim(a.Name), Nickname: trim(a.Nickname), Gender: trim(a.Gender), Status: trim(a.Status),
		BirthDate: trim(a.BirthDate), BirthDateQualifier: trim(a.BirthDateQualifier), BirthPlace: trim(a.BirthPlace),
		DeathDate: trim(a.DeathDate), DeathDateQualifier: trim(a.DeathDateQualifier), DeathPlace: trim(a.DeathPlace),
		Address: trim(a.Address), Notes: trim(a.Notes),
	}
	tooLongField := func(p *string, max int) bool { return p != nil && utf8.RuneCountInString(*p) > max }
	switch {
	case requireName && (f.Name == nil || *f.Name == ""):
		return nil, "name is required"
	case f.Name != nil && *f.Name == "":
		return nil, "name cannot be empty"
	case tooLongField(f.Name, maxPersonNameLength):
		return nil, fmt.Sprintf("name is longer than %d characters", maxPersonNameLength)
	case tooLongField(f.Nickname, maxPersonNicknameLength):
		return nil, fmt.Sprintf("nickname is longer than %d characters", maxPersonNicknameLength)
	case tooLongField(f.Address, maxPersonAddressLength):
		return nil, fmt.Sprintf("address is longer than %d characters", maxPersonAddressLength)
	case tooLongField(f.BirthPlace, maxPersonPlaceLength), tooLongField(f.DeathPlace, maxPersonPlaceLength):
		return nil, fmt.Sprintf("places are limited to %d characters", maxPersonPlaceLength)
	case tooLongField(f.Notes, maxPersonNotesLength):
		return nil, fmt.Sprintf("notes are longer than %d characters", maxPersonNotesLength)
	case f.Gender != nil && !personGenders[*f.Gender]:
		return nil, "gender must be male, female, other or unknown"
	case f.Status != nil && *f.Status != "alive" && *f.Status != "deceased":
		return nil, "status must be alive or deceased"
	}
	for _, d := range []*string{f.BirthDate, f.DeathDate} {
		if d != nil && *d != "" && !validActionDate(*d) {
			return nil, "dates must be YYYY, YYYY-MM or YYYY-MM-DD and not in the future"
		}
	}
	for _, q := range []*string{f.BirthDateQualifier, f.DeathDateQualifier} {
		if q != nil && *q != "" && !dateQualifiers[*q] {
			return nil, "date qualifiers are exact, about, before or after"
		}
	}
	if (f.DeathDate != nil && *f.DeathDate != "") || (f.DeathPlace != nil && *f.DeathPlace != "") {
		deceased := "deceased"
		f.Status = &deceased // a death date or place means the person has died
	}
	if *f == (personFields{}) {
		return nil, "nothing to change"
	}
	return f, ""
}

var relationTypes = map[string]bool{"parent": true, "child": true, "partner": true}

// ---- Tool runner (one per request and model attempt) ----

type toolRunner struct {
	ctx     context.Context
	ix      *aiIndex
	access  *treeAccess // nil: read-only (tests)
	seen    map[string]bool
	actions []assistantAction
}

func newToolRunner(ctx context.Context, ix *aiIndex, access *treeAccess) *toolRunner {
	return &toolRunner{ctx: ctx, ix: ix, access: access, seen: map[string]bool{}}
}

func (r *toolRunner) canWrite() bool { return r.access != nil && r.access.atLeast(TreeRoleEditor) }

func (r *toolRunner) tools() []chatTool {
	if r.canWrite() {
		return append(append([]chatTool{}, assistantTools...), assistantWriteTools...)
	}
	return assistantTools
}

func (r *toolRunner) run(name, args string) string {
	if !strings.HasPrefix(name, "propose_") {
		return r.ix.runTool(name, args, r.seen)
	}
	var out any
	if !r.canWrite() {
		out = map[string]string{"error": "this member can only view the tree; changes need an editor or owner"}
	} else if len(r.actions) >= maxAssistantActions {
		out = map[string]string{"error": fmt.Sprintf("at most %d changes per answer; ask the user to apply these first", maxAssistantActions)}
	} else if action, msg := r.propose(name, args); msg != "" {
		out = map[string]string{"error": msg}
	} else {
		action.ID = fmt.Sprintf("a%d", len(r.actions)+1)
		r.actions = append(r.actions, *action)
		out = map[string]any{"proposed": true, "id": action.ID, "note": "Shown to the user with an Apply button. It is NOT done until they apply it."}
	}
	b, _ := json.Marshal(out)
	return string(b)
}

// person looks up an id in this tree and checks the asker may edit it (when write is true).
func (r *toolRunner) person(id string, write bool) (*aiPerson, string) {
	p := r.ix.byID[strings.TrimSpace(id)]
	if p == nil {
		return nil, "no person with id " + id + " in this tree; use search_people"
	}
	if write {
		ok, err := r.access.canWritePerson(r.ctx, p.ID)
		if err != nil {
			return nil, "could not check permissions"
		}
		if !ok {
			return nil, "you may not edit " + p.Name + " (their branch is not shared with you)"
		}
	}
	r.seen[p.ID] = true
	return p, ""
}

func (r *toolRunner) propose(name, args string) (*assistantAction, string) {
	raw := []byte(orEmptyObject(args))
	switch name {
	case "propose_add_person":
		var a struct {
			fieldArgs
			RelativeID    string `json:"relative_id"`
			Relation      string `json:"relation"`
			OtherParentID string `json:"other_parent_id"`
		}
		if json.Unmarshal(raw, &a) != nil {
			return nil, "invalid arguments"
		}
		fields, msg := a.fieldArgs.toFields(true)
		if msg != "" {
			return nil, msg
		}
		act := &assistantAction{Type: "add_person", Fields: fields}
		if a.RelativeID != "" || a.Relation != "" {
			if !relationTypes[a.Relation] {
				return nil, "relation must be parent, child or partner (the new person's role towards relative_id)"
			}
			rel, msg := r.person(a.RelativeID, false)
			if msg != "" {
				return nil, msg
			}
			act.RelativeID, act.RelativeName, act.Relation = rel.ID, rel.Name, a.Relation
			if a.OtherParentID != "" {
				if a.Relation != "child" {
					return nil, "other_parent_id is only for adding a child"
				}
				other, msg := r.person(a.OtherParentID, false)
				if msg != "" {
					return nil, msg
				}
				act.OtherParentID, act.OtherParentName = other.ID, other.Name
			}
		}
		return act, ""
	case "propose_update_person":
		var a struct {
			ID string `json:"id"`
			fieldArgs
		}
		if json.Unmarshal(raw, &a) != nil {
			return nil, "invalid arguments"
		}
		p, msg := r.person(a.ID, true)
		if msg != "" {
			return nil, msg
		}
		fields, msg := a.fieldArgs.toFields(false)
		if msg != "" {
			return nil, msg
		}
		return &assistantAction{Type: "update_person", PersonID: p.ID, PersonName: p.Name, Fields: fields}, ""
	case "propose_add_relationship":
		var a struct {
			PersonID   string `json:"person_id"`
			RelativeID string `json:"relative_id"`
			Relation   string `json:"relation"`
		}
		if json.Unmarshal(raw, &a) != nil {
			return nil, "invalid arguments"
		}
		if !relationTypes[a.Relation] {
			return nil, "relation must be parent, child or partner (person_id's role towards relative_id)"
		}
		p, msg := r.person(a.PersonID, true)
		if msg != "" {
			return nil, msg
		}
		rel, msg := r.person(a.RelativeID, false)
		if msg != "" {
			return nil, msg
		}
		if p.ID == rel.ID {
			return nil, "a person cannot be related to themselves"
		}
		if r.ix.related(p.ID, rel.ID, a.Relation) {
			return nil, "already linked that way"
		}
		return &assistantAction{Type: "add_relationship", PersonID: p.ID, PersonName: p.Name,
			RelativeID: rel.ID, RelativeName: rel.Name, Relation: a.Relation}, ""
	case "propose_add_family":
		var a struct {
			Name     string `json:"name"`
			PersonID string `json:"person_id"`
		}
		if json.Unmarshal(raw, &a) != nil {
			return nil, "invalid arguments"
		}
		famName, ok := validFamilyName(a.Name)
		if !ok {
			return nil, fmt.Sprintf("family name is required (max %d characters)", maxFamilyNameLength)
		}
		p, msg := r.person(a.PersonID, true)
		if msg != "" {
			return nil, msg
		}
		return &assistantAction{Type: "add_family", PersonID: p.ID, PersonName: p.Name, FamilyName: famName}, ""
	case "propose_rename_family":
		var a struct {
			FamilyID string `json:"family_id"`
			Name     string `json:"name"`
		}
		if json.Unmarshal(raw, &a) != nil {
			return nil, "invalid arguments"
		}
		famName, ok := validFamilyName(a.Name)
		if !ok {
			return nil, fmt.Sprintf("family name is required (max %d characters)", maxFamilyNameLength)
		}
		fam := r.ix.familyByID[strings.TrimSpace(a.FamilyID)]
		if fam == nil {
			return nil, "no family with that id; use list_families"
		}
		okWrite, err := r.access.canWriteFamily(r.ctx, fam.ID)
		if err != nil {
			return nil, "could not check permissions"
		}
		if !okWrite {
			return nil, "you may not rename this family"
		}
		return &assistantAction{Type: "rename_family", FamilyID: fam.ID, FamilyName: famName}, ""
	}
	return nil, "unknown tool"
}

// related reports whether person is already rel's <relation>.
func (ix *aiIndex) related(person, rel, relation string) bool {
	var list []string
	switch relation {
	case "parent":
		list = ix.parents[rel]
	case "child":
		list = ix.children[rel]
	case "partner":
		list = ix.partners[rel]
	}
	for _, id := range list {
		if id == person {
			return true
		}
	}
	return false
}

var personFieldProps = map[string]any{
	"name":                 map[string]any{"type": "string", "description": "Full name"},
	"nickname":             map[string]any{"type": "string"},
	"gender":               map[string]any{"type": "string", "enum": []string{"male", "female", "other", "unknown"}},
	"status":               map[string]any{"type": "string", "enum": []string{"alive", "deceased"}},
	"birth_date":           map[string]any{"type": "string", "description": "YYYY, YYYY-MM or YYYY-MM-DD"},
	"birth_date_qualifier": map[string]any{"type": "string", "enum": []string{"exact", "about", "before", "after"}},
	"birth_place":          map[string]any{"type": "string"},
	"death_date":           map[string]any{"type": "string", "description": "YYYY, YYYY-MM or YYYY-MM-DD (implies deceased)"},
	"death_date_qualifier": map[string]any{"type": "string", "enum": []string{"exact", "about", "before", "after"}},
	"death_place":          map[string]any{"type": "string"},
	"address":              map[string]any{"type": "string", "description": "Where the person lives"},
	"notes":                map[string]any{"type": "string"},
}

func withProps(extra map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range personFieldProps {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

var relationProp = map[string]any{"type": "string", "enum": []string{"parent", "child", "partner"}}

var assistantWriteTools = []chatTool{
	{Type: "function", Function: chatFunction{
		Name:        "propose_add_person",
		Description: "Propose adding a new person, optionally linked to an existing relative: relation is the NEW person's role towards relative_id (parent = the new person is relative's parent; child = the new person is relative's child, give other_parent_id for the other parent if known; partner = spouse). Search first so you do not add someone who already exists. The user must apply it.",
		Parameters: map[string]any{"type": "object", "required": []string{"name"}, "properties": withProps(map[string]any{
			"relative_id":     map[string]any{"type": "string"},
			"relation":        relationProp,
			"other_parent_id": map[string]any{"type": "string", "description": "Only when adding a child: the other parent"},
		})},
	}},
	{Type: "function", Function: chatFunction{
		Name:        "propose_update_person",
		Description: "Propose changing an existing person's details. Send only the fields that change; an empty string clears a field. The user must apply it.",
		Parameters: map[string]any{"type": "object", "required": []string{"id"}, "properties": withProps(map[string]any{
			"id": map[string]any{"type": "string"},
		})},
	}},
	{Type: "function", Function: chatFunction{
		Name:        "propose_add_relationship",
		Description: "Propose linking two existing people: person_id becomes relative_id's parent, child or partner. The user must apply it.",
		Parameters: map[string]any{"type": "object", "required": []string{"person_id", "relative_id", "relation"}, "properties": map[string]any{
			"person_id":   map[string]any{"type": "string"},
			"relative_id": map[string]any{"type": "string"},
			"relation":    relationProp,
		}},
	}},
	{Type: "function", Function: chatFunction{
		Name:        "propose_add_family",
		Description: "Propose creating a named family (household or branch, e.g. \"Bani Hasan\") headed by an existing person. The user must apply it.",
		Parameters: map[string]any{"type": "object", "required": []string{"name", "person_id"}, "properties": map[string]any{
			"name":      map[string]any{"type": "string"},
			"person_id": map[string]any{"type": "string"},
		}},
	}},
	{Type: "function", Function: chatFunction{
		Name:        "propose_rename_family",
		Description: "Propose renaming an existing family (ids from list_families). The user must apply it.",
		Parameters: map[string]any{"type": "object", "required": []string{"family_id", "name"}, "properties": map[string]any{
			"family_id": map[string]any{"type": "string"},
			"name":      map[string]any{"type": "string"},
		}},
	}},
}
