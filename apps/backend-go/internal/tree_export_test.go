package app

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

var cellRef = regexp.MustCompile(`^([A-Z]+)(\d+)$`)

// readSheet returns sheet n (1-based) of an .xlsx as rows of text, the workbook's sheet names, and checks
// that every part is well-formed XML.
func readSheet(t *testing.T, data []byte, n int) ([][]string, []string) {
	t.Helper()
	z, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{}
	for _, f := range z.File {
		r, _ := f.Open()
		b, _ := io.ReadAll(r)
		r.Close()
		files[f.Name] = b
		var any struct{}
		if err := xml.Unmarshal(b, &any); err != nil {
			t.Fatalf("%s is not valid XML: %v", f.Name, err)
		}
	}
	var wb struct {
		Sheets []struct {
			Name string `xml:"name,attr"`
		} `xml:"sheets>sheet"`
	}
	_ = xml.Unmarshal(files["xl/workbook.xml"], &wb)
	var names []string
	for _, s := range wb.Sheets {
		names = append(names, s.Name)
	}
	var ws struct {
		Rows []struct {
			Cells []struct {
				Ref  string `xml:"r,attr"`
				Text string `xml:"is>t"`
			} `xml:"c"`
		} `xml:"sheetData>row"`
	}
	if err := xml.Unmarshal(files["xl/worksheets/sheet"+strconv.Itoa(n)+".xml"], &ws); err != nil {
		t.Fatal(err)
	}
	var rows [][]string
	for _, r := range ws.Rows {
		row := make([]string, 26)
		for _, c := range r.Cells {
			col := cellRef.FindStringSubmatch(c.Ref)[1]
			row[int(col[0]-'A')] = c.Text // tests stay within A..Z
		}
		rows = append(rows, row)
	}
	return rows, names
}

func rawGet(t *testing.T, user, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, user))
	rec := httptest.NewRecorder()
	testRouter.ServeHTTP(rec, req)
	return rec
}

func TestTreeExportFormats(t *testing.T) {
	resetDB(t)
	// A child of pA1 + pA2 with a partial, approximate birth date and a multi-line note.
	DB.Exec(`INSERT INTO people (id, tree_id, name, nickname, address, status, gender, birth_date, birth_date_precision, birth_date_qualifier, notes, religion, created_at)
		VALUES ('p-kid', ?, 'Kid Sato', 'Kiddo', 'Jl. Ijen 5', 'alive', 'female', '1990-01-01T00:00:00Z', 'year', 'about', 'line one
line two', 'protestant', now())`, treeA)
	DB.Exec(`INSERT INTO relationships (id, tree_id, from_id, to_id, type, sort_order) VALUES
		('r-k1', ?, ?, 'p-kid', 'parent', 0), ('r-k2', ?, ?, 'p-kid', 'parent', 0)`, treeA, pA1, treeA, pA2)
	bumpTreeCache(t.Context(), treeA)
	base := "/api/trees/" + treeA + "/export"

	expectStatus(t, bob, 403, []routeCase{{"GET", base + "?format=xlsx", nil}})
	expectStatus(t, alice, 400, []routeCase{{"GET", base + "?format=pdf", nil}})

	rec := rawGet(t, alice, base+"?format=xlsx&lang=id")
	if rec.Code != 200 || !strings.Contains(rec.Header().Get("Content-Disposition"), `filename="A.xlsx"`) {
		t.Fatalf("xlsx: %d %v", rec.Code, rec.Header())
	}
	rows, sheets := readSheet(t, rec.Body.Bytes(), 1)
	if strings.Join(sheets, ",") != "Orang,Keluarga" || len(rows) != 4 || rows[0][0] != "Nama" {
		t.Fatalf("people sheet %v: %v", sheets, rows)
	}
	var kid []string
	for _, r := range rows {
		if r[0] == "Kid Sato" {
			kid = r
		}
	}
	if kid == nil || kid[2] != "Perempuan" || kid[4] != "Kristen" || kid[5] != "sekitar 1990" || kid[11] != "A One, A Two" {
		t.Errorf("kid row: %q", kid)
	}
	if fams, _ := readSheet(t, rec.Body.Bytes(), 2); len(fams) != 3 {
		t.Errorf("families sheet: %v", fams)
	}

	rec = rawGet(t, alice, base+"?format=gedcom")
	ged := rec.Body.String()
	for _, want := range []string{"0 HEAD", "1 CHAR UTF-8", "1 NAME Kid Sato", "2 NICK Kiddo", "2 DATE ABT 1990", "1 RELI Protestant", "1 NOTE line one\n2 CONT line two",
		"1 HUSB @I", "1 WIFE @I", "1 CHIL @I", "0 TRLR"} {
		if !strings.Contains(ged, want) {
			t.Errorf("gedcom missing %q", want)
		}
	}
	if strings.Count(ged, " FAM\n") != 1 { // A One + A Two: one family with the child
		t.Errorf("gedcom families: %d\n%s", strings.Count(ged, " FAM\n"), ged)
	}

	// Branches, like the copy dialog. The kid's ancestors are the kid and both parents; A Two's
	// descendants are A Two, her partner A One and the kid.
	count := func(q string) int {
		t.Helper()
		r := call(t, alice, "GET", base+"?format=json&"+q, nil)
		if r.Status != 200 {
			t.Fatalf("%s: %d %v", q, r.Status, r.Body)
		}
		return len(dataMap(r)["people"].([]any))
	}
	if n := count("scope=ancestors&person=p-kid"); n != 3 {
		t.Errorf("ancestors of kid: %d", n)
	}
	if n := count("scope=descendants&person=" + pA2); n != 3 {
		t.Errorf("descendants of A Two: %d", n)
	}
	if n := count("scope=nearby&steps=1&person=p-kid"); n != 3 {
		t.Errorf("close family of kid: %d", n)
	}
	rec = rawGet(t, alice, base+"?format=gedcom&scope=ancestors&person=p-kid")
	if !strings.Contains(rec.Header().Get("Content-Disposition"), `filename="A - Kid Sato.ged"`) {
		t.Errorf("branch file name: %v", rec.Header().Get("Content-Disposition"))
	}
	expectStatus(t, alice, 400, []routeCase{
		{"GET", base + "?scope=sideways&person=p-kid", nil},
		{"GET", base + "?scope=ancestors", nil},
		{"GET", base + "?scope=nearby&steps=9&person=p-kid", nil},
	})
	expectStatus(t, alice, 404, []routeCase{{"GET", base + "?scope=ancestors&person=" + pB1, nil}}) // other tree

	res := call(t, alice, "GET", base, nil) // default stays JSON
	if res.Status != 200 || len(dataMap(res)["people"].([]any)) != 3 {
		t.Errorf("json: %d", res.Status)
	}
}
