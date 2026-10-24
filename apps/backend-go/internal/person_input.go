package app

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

// Person form fields (multipart or urlencoded), shared by the legacy /api/person routes and the
// tree-scoped routes. Legacy clients only send the original fields, so the newer ones (death date, places,
// notes, qualifiers) keep their stored value when absent and are cleared by sending an empty value.

const (
	maxPersonNameLength     = 120
	maxPersonNicknameLength = 60
	maxPersonAddressLength  = 300
	maxPersonPlaceLength    = 200
	maxPersonNotesLength    = 5000
	maxPersonPhoneLength    = 32
)

const (
	precisionDay   = "day"
	precisionMonth = "month"
	precisionYear  = "year"
)

// precisionRank orders precisions from finest to coarsest.
var precisionRank = map[string]int{precisionDay: 1, precisionMonth: 2, precisionYear: 3}

var dateQualifiers = map[string]bool{"exact": true, "about": true, "before": true, "after": true}

var personGenders = map[string]bool{"male": true, "female": true, "other": true, "unknown": true}

var (
	yearOnly     = regexp.MustCompile(`^\d{4}$`)
	yearMonth    = regexp.MustCompile(`^\d{4}-\d{2}$`)
	yearMonthDay = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	phonePattern = regexp.MustCompile(`^[0-9 +()\-]*$`)
)

// partialDate is a date known to a day, month or year. A nil Time means unknown.
type partialDate struct {
	Time      *time.Time
	Precision string
}

// parsePartialDate accepts "YYYY", "YYYY-MM", "YYYY-MM-DD" (stored as the first instant of the period, UTC)
// and the legacy RFC3339 form (kept as sent, in UTC, with day precision). Empty means unknown.
func parsePartialDate(s string) (partialDate, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return partialDate{}, nil
	}
	layout, precision := "", ""
	switch {
	case yearOnly.MatchString(s):
		layout, precision = "2006", precisionYear
	case yearMonth.MatchString(s):
		layout, precision = "2006-01", precisionMonth
	case yearMonthDay.MatchString(s):
		layout, precision = "2006-01-02", precisionDay
	default:
		layout, precision = time.RFC3339, precisionDay
	}
	t, err := time.Parse(layout, s)
	if err != nil || t.Year() < 1 {
		return partialDate{}, fmt.Errorf("invalid date %q", s)
	}
	t = t.UTC()
	return partialDate{Time: &t, Precision: precision}, nil
}

// truncateTo moves t to the first instant of its period at the given precision.
func truncateTo(t time.Time, precision string) time.Time {
	switch precision {
	case precisionYear:
		return time.Date(t.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	case precisionMonth:
		return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
	}
	return t
}

// dateField resolves one date (birth or death) from the form.
type dateField struct {
	label          string // "birth date" / "death date"
	date           partialDate
	qualifier      string
	explicitlySent bool
}

// readDateField parses <name>, <name>Precision and <name>Qualifier. With keepWhenAbsent, an absent <name> keeps
// the stored date. When <name> is present, the stored value is only used to keep a coarser stored precision for a
// legacy client that echoes the full date back.
func readDateField(c *gin.Context, name, label string, keepWhenAbsent bool, stored partialDate, storedQualifier string) (dateField, string) {
	out := dateField{label: label}
	raw, present := c.GetPostForm(name)
	if !present && keepWhenAbsent {
		out.date, out.qualifier = stored, storedQualifier
	} else {
		out.explicitlySent = present && strings.TrimSpace(raw) != ""
		d, err := parsePartialDate(raw)
		if err != nil {
			return out, "Invalid " + label + " (use YYYY, YYYY-MM or YYYY-MM-DD)"
		}
		if d.Time != nil {
			if p := strings.TrimSpace(c.PostForm(name + "Precision")); p != "" {
				if precisionRank[p] == 0 {
					return out, "Invalid " + label + " precision (day, month or year)"
				}
				// Only a coarser precision than the input can express is honoured (e.g. an ISO date + "year").
				if precisionRank[p] > precisionRank[d.Precision] {
					t := truncateTo(*d.Time, p)
					d = partialDate{Time: &t, Precision: p}
				}
			} else if stored.Time != nil && stored.Time.Equal(*d.Time) && precisionRank[stored.Precision] > precisionRank[d.Precision] {
				d.Precision = stored.Precision
			}
		}
		out.date = d
		out.qualifier = storedQualifier
	}
	if q, ok := c.GetPostForm(name + "Qualifier"); ok {
		q = strings.TrimSpace(q)
		if q != "" && !dateQualifiers[q] {
			return out, "Invalid " + label + " qualifier (exact, about, before or after)"
		}
		out.qualifier = q
	}
	if out.date.Time == nil {
		out.qualifier = ""
		out.date.Precision = ""
	} else if out.qualifier == "" {
		out.qualifier = "exact"
	}
	return out, ""
}

// deathBeforeBirth reports whether the death date is certainly before the birth date, comparing both at the
// coarser of their precisions. Approximate ("about") or open-ended ("before" birth, "after" death) dates are
// not compared.
func deathBeforeBirth(birth, death dateField) bool {
	if birth.date.Time == nil || death.date.Time == nil {
		return false
	}
	if birth.qualifier == "about" || birth.qualifier == "before" || death.qualifier == "about" || death.qualifier == "after" {
		return false
	}
	precision := birth.date.Precision
	if precisionRank[death.date.Precision] > precisionRank[precision] {
		precision = death.date.Precision
	}
	if precision == precisionDay {
		b, d := *birth.date.Time, *death.date.Time
		return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC).Before(time.Date(b.Year(), b.Month(), b.Day(), 0, 0, 0, 0, time.UTC))
	}
	return truncateTo(*death.date.Time, precision).Before(truncateTo(*birth.date.Time, precision))
}

func tooLong(s string, max int) bool { return utf8.RuneCountInString(s) > max }

// optionalText reads a field that keeps its current value when absent.
func optionalText(c *gin.Context, name string, current string) (string, bool) {
	v, ok := c.GetPostForm(name)
	if !ok {
		return current, false
	}
	return strings.TrimSpace(v), true
}

// bindPersonForm validates the person form and applies it to p (a fresh Person on create, the stored one on
// update). It returns a client-facing message when the input is invalid.
func bindPersonForm(c *gin.Context, p *Person, creating bool) string {
	// Legacy routes have no :treeId; they keep requiring an explicit gender like the Node.js API did.
	treeScoped := c.Param("treeId") != ""

	name := strings.TrimSpace(c.PostForm("name"))
	nickname := strings.TrimSpace(c.PostForm("nickname"))
	address := strings.TrimSpace(c.PostForm("address"))
	status := strings.TrimSpace(c.PostForm("status"))
	gender := strings.TrimSpace(c.PostForm("gender"))
	phone := strings.TrimSpace(c.PostForm("phone"))

	switch {
	case name == "":
		return "Name is required"
	case tooLong(name, maxPersonNameLength):
		return fmt.Sprintf("Name must be at most %d characters", maxPersonNameLength)
	case tooLong(nickname, maxPersonNicknameLength):
		return fmt.Sprintf("Nickname must be at most %d characters", maxPersonNicknameLength)
	case tooLong(address, maxPersonAddressLength):
		return fmt.Sprintf("Address must be at most %d characters", maxPersonAddressLength)
	case status != "alive" && status != "deceased":
		return "Status must be alive or deceased"
	case len(phone) > maxPersonPhoneLength || !phonePattern.MatchString(phone):
		return fmt.Sprintf("Phone must be at most %d characters of digits, spaces, +, -, ( and )", maxPersonPhoneLength)
	}
	if gender == "" && treeScoped {
		gender = "unknown"
	}
	if !personGenders[gender] {
		return "Gender must be male, female, other or unknown"
	}

	var storedBirth, storedDeath partialDate
	if !p.BirthDate.IsZero() {
		bd := p.BirthDate
		storedBirth = partialDate{Time: &bd, Precision: p.BirthDatePrecision}
	}
	if p.DeathDate != nil {
		storedDeath = partialDate{Time: p.DeathDate, Precision: p.DeathDatePrecision}
	}
	// birthDate is an original field: legacy clients always send it, so absent means unknown.
	birth, msg := readDateField(c, "birthDate", "birth date", false, storedBirth, p.BirthDateQualifier)
	if msg != "" {
		return msg
	}
	death, msg := readDateField(c, "deathDate", "death date", !creating, storedDeath, p.DeathDateQualifier)
	if msg != "" {
		return msg
	}
	if status != "deceased" && death.date.Time != nil {
		if death.explicitlySent {
			return "Death date is only allowed when status is deceased"
		}
		// A stored death date the client did not send goes away with the deceased status.
		death = dateField{label: death.label}
	}
	if deathBeforeBirth(birth, death) {
		return "Death date cannot be before birth date"
	}

	birthPlace, _ := optionalText(c, "birthPlace", p.BirthPlace)
	deathPlace, _ := optionalText(c, "deathPlace", p.DeathPlace)
	notes, _ := optionalText(c, "notes", p.Notes)
	switch {
	case tooLong(birthPlace, maxPersonPlaceLength):
		return fmt.Sprintf("Birth place must be at most %d characters", maxPersonPlaceLength)
	case tooLong(deathPlace, maxPersonPlaceLength):
		return fmt.Sprintf("Death place must be at most %d characters", maxPersonPlaceLength)
	case tooLong(notes, maxPersonNotesLength):
		return fmt.Sprintf("Notes must be at most %d characters", maxPersonNotesLength)
	}

	p.Name, p.Nickname, p.Address, p.Status, p.Gender, p.Phone = name, nickname, address, status, gender, phone
	p.BirthDate = time.Time{}
	if birth.date.Time != nil {
		p.BirthDate = *birth.date.Time
	}
	p.BirthDatePrecision, p.BirthDateQualifier = birth.date.Precision, birth.qualifier
	p.DeathDate, p.DeathDatePrecision, p.DeathDateQualifier = death.date.Time, death.date.Precision, death.qualifier
	p.BirthPlace, p.DeathPlace, p.Notes = birthPlace, deathPlace, notes
	return ""
}
