package app

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Tree export in formats people can use: Excel (xlsx.go) (one row per person, readable in Excel / Google Sheets /
// WPS), GEDCOM 5.5.1 (imported by every genealogy app: MyHeritage, Ancestry, FamilySearch, Gramps) and
// the full JSON backup. Owners only (see routes.go).

type exportData struct {
	tree     *Tree
	subject  string // name of the person a branch export starts from; empty for the whole tree
	people   []*Person
	byID     map[string]*Person
	parents  map[string][]string
	children map[string][]string
	partners map[string][]string
	families []*Family
}

// exportScope is ?scope=all (default) or a branch like the copy dialog: descendants, ancestors, both, or
// nearby with steps, starting from ?person=.
type exportScope struct {
	scope  importScope // "" = whole tree
	person string
	steps  int
}

func parseExportScope(c *gin.Context) (exportScope, string) {
	s := c.DefaultQuery("scope", "all")
	if s == "all" {
		return exportScope{}, ""
	}
	out := exportScope{scope: importScope(s), person: c.Query("person")}
	switch out.scope {
	case scopeDescendants, scopeAncestors, scopeBoth:
	case scopeNearby:
		n, err := strconv.Atoi(c.Query("steps"))
		if err != nil || n < 1 || n > 6 {
			return out, "steps must be between 1 and 6"
		}
		out.steps = n
	default:
		return out, "scope must be all, descendants, ancestors, both or nearby"
	}
	if out.person == "" {
		return out, "choose the person the branch starts from"
	}
	return out, ""
}

func loadExport(c *gin.Context, treeID string, sc exportScope) (*exportData, error) {
	tree, err := getTreeRepo(c, treeID)
	if err != nil {
		return nil, err
	}
	people, err := repoGetAllPeople(c, treeID, nil)
	if err != nil {
		return nil, err
	}
	g, err := repoGetTreeGraph(c, treeID)
	if err != nil {
		return nil, err
	}
	families, err := getAllFamiliesRepo(c, treeID, nil)
	if err != nil {
		return nil, err
	}
	// keep: everyone in the branch (nil = whole tree). Relationships to people outside it are dropped.
	var keep map[string]bool
	d := &exportData{tree: tree, byID: map[string]*Person{}, parents: map[string][]string{},
		children: map[string][]string{}, partners: map[string][]string{}}
	if sc.scope != "" {
		found := false
		for _, p := range people {
			if p.ID == sc.person {
				found, d.subject = true, p.Name
			}
		}
		if !found {
			return nil, errExportPerson
		}
		keep = map[string]bool{}
		for _, id := range selectBranch(g, sc.person, sc.scope, sc.steps, maxGraphPeople) {
			keep[id] = true
		}
	}
	in := func(id string) bool { return keep == nil || keep[id] }
	for _, p := range people {
		if in(p.ID) {
			d.people = append(d.people, p)
			d.byID[p.ID] = p
		}
	}
	for _, pc := range g.ParentChild {
		if in(pc.Parent) && in(pc.Child) {
			d.parents[pc.Child] = append(d.parents[pc.Child], pc.Parent)
			d.children[pc.Parent] = append(d.children[pc.Parent], pc.Child)
		}
	}
	for _, u := range g.Unions {
		if in(u.Partners[0]) && in(u.Partners[1]) {
			d.partners[u.Partners[0]] = append(d.partners[u.Partners[0]], u.Partners[1])
			d.partners[u.Partners[1]] = append(d.partners[u.Partners[1]], u.Partners[0])
		}
	}
	for _, f := range families {
		if f.Person == nil || in(f.Person.ID) {
			d.families = append(d.families, f)
		}
	}
	return d, nil
}

func (d *exportData) names(ids []string) string {
	var out []string
	for _, id := range ids {
		if p := d.byID[id]; p != nil {
			out = append(out, p.Name)
		}
	}
	return strings.Join(out, ", ")
}

// readableDate: "12 May 1980", "May 1980", "1980", with "about"/"before"/"after" in the export language.
func readableDate(t *time.Time, precision, qualifier string, id bool) string {
	if t == nil || t.IsZero() {
		return ""
	}
	u := t.UTC()
	months := []string{"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}
	if id {
		months = []string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}
	}
	var s string
	switch precision {
	case precisionYear:
		s = fmt.Sprint(u.Year())
	case precisionMonth:
		s = fmt.Sprintf("%s %d", months[u.Month()-1], u.Year())
	default:
		s = fmt.Sprintf("%d %s %d", u.Day(), months[u.Month()-1], u.Year())
	}
	q := map[string]string{"about": "about", "before": "before", "after": "after"}
	if id {
		q = map[string]string{"about": "sekitar", "before": "sebelum", "after": "setelah"}
	}
	if w, ok := q[qualifier]; ok {
		s = w + " " + s
	}
	return s
}

func birthOf(p *Person) *time.Time {
	if p.BirthDate.IsZero() {
		return nil
	}
	return &p.BirthDate
}

// ---- Excel ----

func (d *exportData) xlsx(lang string) ([]byte, error) {
	id := lang == "id"
	tr := func(en, idn string) string {
		if id {
			return idn
		}
		return en
	}
	gender := map[string]string{"male": tr("Male", "Laki-laki"), "female": tr("Female", "Perempuan"), "other": tr("Other", "Lainnya"), "unknown": ""}
	status := map[string]string{"alive": tr("Living", "Masih hidup"), "deceased": tr("Deceased", "Sudah meninggal")}
	religion := map[string]string{"islam": "Islam", "protestant": tr("Protestant", "Kristen"), "catholic": tr("Catholic", "Katolik"),
		"hindu": "Hindu", "buddhist": tr("Buddhist", "Buddha"), "confucian": tr("Confucian", "Konghucu"), "other": tr("Other", "Lainnya")}

	people := append([]*Person{}, d.people...)
	sort.SliceStable(people, func(i, j int) bool { return strings.ToLower(people[i].Name) < strings.ToLower(people[j].Name) })
	peopleRows := make([][]string, 0, len(people))
	for _, p := range people {
		peopleRows = append(peopleRows, []string{
			p.Name, p.Nickname, gender[p.Gender], status[p.Status], religion[p.Religion],
			readableDate(birthOf(p), p.BirthDatePrecision, p.BirthDateQualifier, id), p.BirthPlace,
			readableDate(p.DeathDate, p.DeathDatePrecision, p.DeathDateQualifier, id), p.DeathPlace,
			p.Address, p.Phone,
			d.names(d.parents[p.ID]), d.names(d.partners[p.ID]), d.names(d.children[p.ID]),
			p.Notes,
		})
	}
	famRows := make([][]string, 0, len(d.families))
	for _, fam := range d.families {
		head, partners, children := "", "", ""
		if fam.Person != nil {
			head = fam.Person.Name
			partners, children = d.names(d.partners[fam.Person.ID]), d.names(d.children[fam.Person.ID])
		}
		famRows = append(famRows, []string{fam.Name, head, partners, children})
	}
	return writeXLSX(d.tree.Name, []xlsxSheet{
		{
			Name: tr("People", "Orang"),
			Header: []string{tr("Name", "Nama"), tr("Nickname", "Panggilan"), tr("Gender", "Jenis kelamin"), tr("Status", "Status"), tr("Religion", "Agama"),
				tr("Birth date", "Tanggal lahir"), tr("Birth place", "Tempat lahir"), tr("Date of death", "Tanggal wafat"), tr("Place of death", "Tempat wafat"),
				tr("Address", "Alamat"), tr("Phone", "Telepon"), tr("Parents", "Orang tua"), tr("Partners", "Pasangan"), tr("Children", "Anak"), tr("Notes", "Catatan")},
			Widths: []float64{28, 14, 13, 15, 12, 18, 18, 18, 18, 32, 16, 32, 28, 40, 50},
			Rows:   peopleRows,
		},
		{
			Name:   tr("Families", "Keluarga"),
			Header: []string{tr("Family", "Keluarga"), tr("Centered on", "Pusat"), tr("Partners", "Pasangan"), tr("Children", "Anak")},
			Widths: []float64{28, 28, 32, 50},
			Rows:   famRows,
		},
	})
}

// ---- GEDCOM 5.5.1 ----

var gedReligion = map[string]string{"islam": "Islam", "protestant": "Protestant", "catholic": "Catholic", "hindu": "Hindu",
	"buddhist": "Buddhist", "confucian": "Confucian", "other": "Other"}

var gedMonths = []string{"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"}

func gedDate(t *time.Time, precision, qualifier string) string {
	if t == nil || t.IsZero() {
		return ""
	}
	u := t.UTC()
	var s string
	switch precision {
	case precisionYear:
		s = fmt.Sprint(u.Year())
	case precisionMonth:
		s = fmt.Sprintf("%s %d", gedMonths[u.Month()-1], u.Year())
	default:
		s = fmt.Sprintf("%d %s %d", u.Day(), gedMonths[u.Month()-1], u.Year())
	}
	if q := map[string]string{"about": "ABT ", "before": "BEF ", "after": "AFT "}[qualifier]; q != "" {
		s = q + s
	}
	return s
}

var gedLineBreaks = regexp.MustCompile(`\r\n|\r`)

// gedText writes a value at level, continuing new lines with CONT and long lines with CONC.
func gedText(b *strings.Builder, level int, tag, value string) {
	lines := strings.Split(gedLineBreaks.ReplaceAllString(value, "\n"), "\n")
	for i, line := range lines {
		t := tag
		lv := level
		if i > 0 {
			t, lv = "CONT", level+1
		}
		r := []rune(line)
		first := true
		for first || len(r) > 0 {
			n := min(len(r), 200)
			chunk := string(r[:n])
			r = r[n:]
			if first {
				fmt.Fprintf(b, "%d %s %s\n", lv, t, chunk)
				first = false
			} else {
				fmt.Fprintf(b, "%d CONC %s\n", level+1, chunk)
			}
		}
	}
}

func (d *exportData) gedcom() string {
	var b strings.Builder
	b.WriteString("0 HEAD\n1 SOUR SAKDULUR\n2 NAME Sakdulur\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n")
	fmt.Fprintf(&b, "1 DATE %s\n", strings.ToUpper(time.Now().UTC().Format("2 Jan 2006")))
	gedText(&b, 1, "NOTE", d.tree.Name)

	indi := map[string]string{}
	for i, p := range d.people {
		indi[p.ID] = fmt.Sprintf("@I%d@", i+1)
	}

	// Families: every couple, and every set of parents with their children.
	type fam struct {
		id       string
		parents  []string
		children []string
	}
	var fams []*fam
	byKey := map[string]*fam{}
	keyOf := func(parents []string) string {
		s := append([]string{}, parents...)
		sort.Strings(s)
		return strings.Join(s, "+")
	}
	get := func(parents []string) *fam {
		k := keyOf(parents)
		if f := byKey[k]; f != nil {
			return f
		}
		f := &fam{id: fmt.Sprintf("@F%d@", len(fams)+1), parents: parents}
		byKey[k] = f
		fams = append(fams, f)
		return f
	}
	for _, p := range d.people {
		for _, partner := range d.partners[p.ID] {
			if p.ID < partner {
				get([]string{p.ID, partner})
			}
		}
	}
	for _, p := range d.people {
		var ps []string
		for _, id := range d.parents[p.ID] {
			if d.byID[id] != nil && len(ps) < 2 {
				ps = append(ps, id)
			}
		}
		if len(ps) > 0 {
			f := get(ps)
			f.children = append(f.children, p.ID)
		}
	}
	famsOf := map[string][]string{}
	famcOf := map[string][]string{}
	for _, f := range fams {
		for _, p := range f.parents {
			famsOf[p] = append(famsOf[p], f.id)
		}
		for _, c := range f.children {
			famcOf[c] = append(famcOf[c], f.id)
		}
	}

	for _, p := range d.people {
		fmt.Fprintf(&b, "0 %s INDI\n", indi[p.ID])
		gedText(&b, 1, "NAME", p.Name)
		if p.Nickname != "" {
			gedText(&b, 2, "NICK", p.Nickname)
		}
		sex := map[string]string{"male": "M", "female": "F"}[p.Gender]
		if sex == "" {
			sex = "U"
		}
		fmt.Fprintf(&b, "1 SEX %s\n", sex)
		if r := gedReligion[p.Religion]; r != "" {
			gedText(&b, 1, "RELI", r)
		}
		if date, place := gedDate(birthOf(p), p.BirthDatePrecision, p.BirthDateQualifier), p.BirthPlace; date != "" || place != "" {
			b.WriteString("1 BIRT\n")
			if date != "" {
				fmt.Fprintf(&b, "2 DATE %s\n", date)
			}
			if place != "" {
				gedText(&b, 2, "PLAC", place)
			}
		}
		if p.Status == "deceased" {
			date, place := gedDate(p.DeathDate, p.DeathDatePrecision, p.DeathDateQualifier), p.DeathPlace
			if date == "" && place == "" {
				b.WriteString("1 DEAT Y\n")
			} else {
				b.WriteString("1 DEAT\n")
				if date != "" {
					fmt.Fprintf(&b, "2 DATE %s\n", date)
				}
				if place != "" {
					gedText(&b, 2, "PLAC", place)
				}
			}
		}
		if p.Address != "" || p.Phone != "" {
			b.WriteString("1 RESI\n")
			if p.Address != "" {
				gedText(&b, 2, "ADDR", p.Address)
			}
			if p.Phone != "" {
				gedText(&b, 2, "PHON", p.Phone)
			}
		}
		if p.Notes != "" {
			gedText(&b, 1, "NOTE", p.Notes)
		}
		for _, f := range famcOf[p.ID] {
			fmt.Fprintf(&b, "1 FAMC %s\n", f)
		}
		for _, f := range famsOf[p.ID] {
			fmt.Fprintf(&b, "1 FAMS %s\n", f)
		}
	}
	for _, f := range fams {
		fmt.Fprintf(&b, "0 %s FAM\n", f.id)
		// GEDCOM 5.5.1 has HUSB/WIFE slots; fill them by gender, otherwise in order.
		husb, wife := "", ""
		for _, pid := range f.parents {
			g := d.byID[pid].Gender
			switch {
			case g == "female" && wife == "":
				wife = pid
			case g != "female" && husb == "":
				husb = pid
			case wife == "":
				wife = pid
			default:
				husb = pid
			}
		}
		if husb != "" {
			fmt.Fprintf(&b, "1 HUSB %s\n", indi[husb])
		}
		if wife != "" {
			fmt.Fprintf(&b, "1 WIFE %s\n", indi[wife])
		}
		for _, c := range f.children {
			fmt.Fprintf(&b, "1 CHIL %s\n", indi[c])
		}
	}
	b.WriteString("0 TRLR\n")
	return b.String()
}

var unsafeFileChars = regexp.MustCompile(`[^\p{L}\p{N} _-]+`)

func attachment(c *gin.Context, base, ext string) {
	name := strings.TrimSpace(unsafeFileChars.ReplaceAllString(base, ""))
	if name == "" {
		name = "sakdulur"
	}
	ascii := strings.Map(func(r rune) rune {
		if r < 128 {
			return r
		}
		return '_'
	}, name)
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.%s"; filename*=UTF-8''%s.%s`, ascii, ext, url.PathEscape(name), ext))
}

var errExportPerson = errors.New("person not in tree")

// exportTree serves GET /api/trees/:treeId/export?format=xlsx|gedcom|json&lang=en|id (default json), with
// an optional branch: &scope=descendants|ancestors|both|nearby&person=<id>[&steps=1-6].
func exportTree(c *gin.Context) {
	access := currentAccess(c)
	format := c.DefaultQuery("format", "json")
	if format != "xlsx" && format != "gedcom" && format != "json" {
		responseError(c, "format must be xlsx, gedcom or json", 400)
		return
	}
	sc, msg := parseExportScope(c)
	if msg != "" {
		responseError(c, msg, 400)
		return
	}
	d, err := loadExport(c, access.TreeID, sc)
	if errors.Is(err, errExportPerson) {
		responseError(c, "Person not found in this tree", 404)
		return
	}
	if err != nil {
		abortServerError(c, err)
		return
	}
	base := d.tree.Name
	if d.subject != "" {
		base += " - " + d.subject
	}
	switch format {
	case "xlsx":
		file, err := d.xlsx(c.Query("lang"))
		if err != nil {
			abortServerError(c, err)
			return
		}
		attachment(c, base, "xlsx")
		c.Data(200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file)
	case "gedcom":
		attachment(c, base, "ged")
		c.Data(200, "text/vnd.familysearch.gedcom; charset=utf-8", []byte(d.gedcom()))
	default:
		members, err := listMembersRepo(c, access.TreeID)
		if err != nil {
			abortServerError(c, err)
			return
		}
		attachment(c, base, "json")
		responseSuccess(c, gin.H{"exportedAt": time.Now(), "tree": d.tree, "people": d.people, "families": d.families, "members": members}, 200)
	}
}
