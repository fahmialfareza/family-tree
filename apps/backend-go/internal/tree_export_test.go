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
		row := make([]string, 14)
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
	DB.Exec(`INSERT INTO people (id, tree_id, name, nickname, address, status, gender, birth_date, birth_date_precision, birth_date_qualifier, notes, created_at)
		VALUES ('p-kid', ?, 'Kid Sato', 'Kiddo', 'Jl. Ijen 5', 'alive', 'female', '1990-01-01T00:00:00Z', 'year', 'about', 'line one
line two', now())`, treeA)
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
	if kid == nil || kid[2] != "Perempuan" || kid[4] != "sekitar 1990" || kid[10] != "A One, A Two" {
		t.Errorf("kid row: %q", kid)
	}
	if fams, _ := readSheet(t, rec.Body.Bytes(), 2); len(fams) != 3 {
		t.Errorf("families sheet: %v", fams)
	}

	rec = rawGet(t, alice, base+"?format=gedcom")
	ged := rec.Body.String()
	for _, want := range []string{"0 HEAD", "1 CHAR UTF-8", "1 NAME Kid Sato", "2 NICK Kiddo", "2 DATE ABT 1990", "1 NOTE line one\n2 CONT line two",
		"1 HUSB @I", "1 WIFE @I", "1 CHIL @I", "0 TRLR"} {
		if !strings.Contains(ged, want) {
			t.Errorf("gedcom missing %q", want)
		}
	}
	if strings.Count(ged, " FAM\n") != 1 { // A One + A Two: one family with the child
		t.Errorf("gedcom families: %d\n%s", strings.Count(ged, " FAM\n"), ged)
	}

	res := call(t, alice, "GET", base, nil) // default stays JSON
	if res.Status != 200 || len(dataMap(res)["people"].([]any)) != 3 {
		t.Errorf("json: %d", res.Status)
	}
}
