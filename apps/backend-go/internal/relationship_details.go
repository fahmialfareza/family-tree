package app

import (
	"strings"
	"time"
)

// RelationshipDetails are the attributes of a relationship pair, kept the same on both rows (see migration 00011):
// Kind on parent/child rows, Status and the dates on spouse rows. Empty Kind means birth; empty Status means married.
type RelationshipDetails struct {
	Kind               string     `json:"kind,omitempty"`
	Status             string     `json:"status,omitempty"`
	StartDate          *time.Time `json:"startDate,omitempty"`
	StartDatePrecision string     `json:"startDatePrecision,omitempty"`
	StartDateQualifier string     `json:"startDateQualifier,omitempty"`
	StartPlace         string     `json:"startPlace,omitempty"`
	EndDate            *time.Time `json:"endDate,omitempty"`
	EndDatePrecision   string     `json:"endDatePrecision,omitempty"`
	EndDateQualifier   string     `json:"endDateQualifier,omitempty"`
}

// parentKinds: kandung, angkat, tiri, asuh, wali, susuan.
var parentKinds = map[string]bool{"birth": true, "adopted": true, "step": true, "foster": true, "guardian": true, "milk": true}

// partnerStatuses: menikah, cerai, pisah, tunangan, pasangan tanpa nikah ("widowed" is shown, not stored).
var partnerStatuses = map[string]bool{"married": true, "divorced": true, "separated": true, "engaged": true, "partner": true}

// relationshipDetailsInput is the JSON a client sends with a relationship. Dates are "YYYY", "YYYY-MM" or "YYYY-MM-DD".
type relationshipDetailsInput struct {
	Kind               string `json:"kind"`
	Status             string `json:"status"`
	StartDate          string `json:"startDate"`
	StartDateQualifier string `json:"startDateQualifier"`
	StartPlace         string `json:"startPlace"`
	EndDate            string `json:"endDate"`
	EndDateQualifier   string `json:"endDateQualifier"`
}

// details validates the input for a relationship of relType and returns it normalised (birth and married are
// stored as empty). The message is non-empty when the input is invalid.
func (in relationshipDetailsInput) details(relType string) (RelationshipDetails, string) {
	var d RelationshipDetails
	kind, status := strings.TrimSpace(in.Kind), strings.TrimSpace(in.Status)
	switch relType {
	case "parent", "child":
		if kind != "" && !parentKinds[kind] {
			return d, "Relationship kind must be birth, adopted, step, foster, guardian or milk"
		}
		if status != "" || in.StartDate != "" || in.EndDate != "" || strings.TrimSpace(in.StartPlace) != "" {
			return d, "Status and dates are only for partners"
		}
		if kind != "birth" {
			d.Kind = kind
		}
		return d, ""
	case "spouse":
		if kind != "" && kind != "birth" {
			return d, "Kind is only for parents and children"
		}
		if status != "" && !partnerStatuses[status] {
			return d, "Partner status must be married, divorced, separated, engaged or partner"
		}
		if status != "married" {
			d.Status = status
		}
	default:
		return d, ""
	}
	start, err := parsePartialDate(in.StartDate)
	if err != nil {
		return d, "Invalid marriage date"
	}
	end, err := parsePartialDate(in.EndDate)
	if err != nil {
		return d, "Invalid end date"
	}
	if end.Time != nil && d.Status != "divorced" && d.Status != "separated" {
		return d, "An end date is only for divorced or separated partners"
	}
	if start.Time != nil && end.Time != nil && end.Time.Before(*start.Time) {
		return d, "The end date can't be before the marriage date"
	}
	place := strings.TrimSpace(in.StartPlace)
	if len([]rune(place)) > maxPersonPlaceLength {
		return d, "Marriage place is too long"
	}
	d.StartDate, d.StartDatePrecision, d.StartDateQualifier = start.Time, start.Precision, qualifierFor(start, in.StartDateQualifier)
	d.EndDate, d.EndDatePrecision, d.EndDateQualifier = end.Time, end.Precision, qualifierFor(end, in.EndDateQualifier)
	d.StartPlace = place
	if d.StartDateQualifier != "" && !dateQualifiers[d.StartDateQualifier] || d.EndDateQualifier != "" && !dateQualifiers[d.EndDateQualifier] {
		return d, "Invalid date qualifier (exact, about, before or after)"
	}
	return d, ""
}

// qualifierFor is the qualifier stored with a date: none without a date, "exact" when not given.
func qualifierFor(date partialDate, qualifier string) string {
	if date.Time == nil {
		return ""
	}
	if q := strings.TrimSpace(qualifier); q != "" {
		return q
	}
	return "exact"
}

func sameTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Equal(*b)
}

func (d RelationshipDetails) equal(o RelationshipDetails) bool {
	return d.Kind == o.Kind && d.Status == o.Status && d.StartPlace == o.StartPlace &&
		sameTime(d.StartDate, o.StartDate) && d.StartDatePrecision == o.StartDatePrecision && d.StartDateQualifier == o.StartDateQualifier &&
		sameTime(d.EndDate, o.EndDate) && d.EndDatePrecision == o.EndDatePrecision && d.EndDateQualifier == o.EndDateQualifier
}

func (r *relationshipRow) details() RelationshipDetails {
	return RelationshipDetails{
		Kind:               deref(r.Kind),
		Status:             deref(r.PartnerStatus),
		StartDate:          r.StartDate,
		StartDatePrecision: deref(r.StartDatePrecision),
		StartDateQualifier: deref(r.StartDateQualifier),
		StartPlace:         deref(r.StartPlace),
		EndDate:            r.EndDate,
		EndDatePrecision:   deref(r.EndDatePrecision),
		EndDateQualifier:   deref(r.EndDateQualifier),
	}
}

func (r *relationshipRow) setDetails(d RelationshipDetails) {
	r.Kind = nullable(d.Kind)
	r.PartnerStatus = nullable(d.Status)
	r.StartDate, r.StartDatePrecision, r.StartDateQualifier = d.StartDate, nullable(d.StartDatePrecision), nullable(d.StartDateQualifier)
	r.StartPlace = nullable(d.StartPlace)
	r.EndDate, r.EndDatePrecision, r.EndDateQualifier = d.EndDate, nullable(d.EndDatePrecision), nullable(d.EndDateQualifier)
}

// relationshipDetailColumns are the columns setDetails writes, for Select on updates and reads.
var relationshipDetailColumns = []string{
	"kind", "partner_status", "start_date", "start_date_precision", "start_date_qualifier", "start_place",
	"end_date", "end_date_precision", "end_date_qualifier",
}
