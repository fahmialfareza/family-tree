package app

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// platformRouter builds the production router (all middleware) in development mode with local uploads.
func platformRouter(t *testing.T) (*gin.Engine, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("APP_ENV", "")
	t.Setenv("ALLOWED_ORIGINS", "")
	t.Setenv("CLOUDINARY_URL", "")
	t.Setenv("UPLOAD_DIR", dir)
	r, err := NewRouter(nil)
	if err != nil {
		t.Fatal(err)
	}
	return r, dir
}

func serve(r http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestHealthHeadersAndRequestID(t *testing.T) {
	resetDB(t)
	r, _ := platformRouter(t)

	rec := serve(r, httptest.NewRequest("GET", "/healthz", nil))
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("healthz: %d %s", rec.Code, rec.Body)
	}
	for header, want := range map[string]string{
		"X-Content-Type-Options":       "nosniff",
		"Referrer-Policy":              "strict-origin-when-cross-origin",
		"X-Frame-Options":              "DENY",
		"Content-Security-Policy":      "default-src 'none'; frame-ancestors 'none'",
		"Cross-Origin-Resource-Policy": "same-site",
	} {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
	if rec.Header().Get("Strict-Transport-Security") != "" {
		t.Error("HSTS must only be sent in production")
	}
	if id := rec.Header().Get("X-Request-ID"); len(id) < 8 {
		t.Errorf("generated request id = %q", id)
	}

	req := httptest.NewRequest("GET", "/readyz", nil)
	req.Header.Set("X-Request-ID", "edge-1234abcd")
	rec = serve(r, req)
	if rec.Code != 200 || rec.Header().Get("X-Request-ID") != "edge-1234abcd" {
		t.Errorf("readyz: %d %s id=%q", rec.Code, rec.Body, rec.Header().Get("X-Request-ID"))
	}
	req = httptest.NewRequest("GET", "/api/nope", nil)
	req.Header.Set("X-Request-ID", "bad id\twith spaces")
	rec = serve(r, req)
	if rec.Code != 404 || strings.Contains(rec.Header().Get("X-Request-ID"), " ") || rec.Header().Get("X-Frame-Options") != "DENY" {
		t.Errorf("404: %d id=%q headers=%v", rec.Code, rec.Header().Get("X-Request-ID"), rec.Header())
	}
}

func TestCORSAllowedOrigins(t *testing.T) {
	r, _ := platformRouter(t)
	preflight := func(origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("OPTIONS", "/api/trees", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "PATCH")
		return serve(r, req)
	}
	ok := preflight("http://localhost:3000")
	if ok.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" || !strings.Contains(ok.Header().Get("Access-Control-Allow-Methods"), "PATCH") {
		t.Errorf("dev origin preflight: %d %v", ok.Code, ok.Header())
	}
	if ok.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Error("credentials must not be allowed")
	}
	if bad := preflight("https://evil.example"); bad.Header().Get("Access-Control-Allow-Origin") != "" || bad.Code < 400 {
		t.Errorf("foreign origin allowed: %d %v", bad.Code, bad.Header())
	}

	t.Setenv("ALLOWED_ORIGINS", "https://app.example")
	r2, err := NewRouter(nil)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("OPTIONS", "/api/trees", nil)
	req.Header.Set("Origin", "https://app.example")
	req.Header.Set("Access-Control-Request-Method", "GET")
	if got := serve(r2, req).Header().Get("Access-Control-Allow-Origin"); got != "https://app.example" {
		t.Errorf("configured origin: %q", got)
	}
	t.Setenv("APP_ENV", "production")
	t.Setenv("ALLOWED_ORIGINS", "")
	if _, err := NewRouter(nil); err == nil {
		t.Error("production router without ALLOWED_ORIGINS accepted")
	}
}

func TestBodyLimits(t *testing.T) {
	resetDB(t)
	r, _ := platformRouter(t)
	token := tokenFor(t, carol)

	// Declared too large: rejected before reading.
	big := `{"name":"` + strings.Repeat("x", maxJSONBodyBytes) + `"}`
	req := httptest.NewRequest("POST", "/api/trees", strings.NewReader(big))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	if rec := serve(r, req); rec.Code != 413 {
		t.Errorf("declared large JSON: %d %s", rec.Code, rec.Body)
	}
	// Streamed (no Content-Length): cut off while parsing, still a 413.
	req = httptest.NewRequest("POST", "/api/trees", io.MultiReader(strings.NewReader(big)))
	req.ContentLength = -1
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	if rec := serve(r, req); rec.Code != 413 {
		t.Errorf("streamed large JSON: %d %s", rec.Code, rec.Body)
	}
	// Multipart gets 6 MB: a 4.9 MB form passes the limit and then fails as a non-image (400, not 413).
	body, ct := multipartBody(t, form{"name": "X", "status": "alive"}, bytes.Repeat([]byte("a"), 4<<20+900<<10))
	req = httptest.NewRequest("POST", "/api/trees/"+treeB+"/people", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("Authorization", "Bearer "+token)
	if rec := serve(r, req); rec.Code != 400 {
		t.Errorf("4.9 MB multipart: %d %s", rec.Code, rec.Body)
	}
	body, ct = multipartBody(t, form{"name": "X", "status": "alive"}, bytes.Repeat([]byte("a"), 7<<20))
	req = httptest.NewRequest("POST", "/api/trees/"+treeB+"/people", io.MultiReader(body))
	req.ContentLength = -1
	req.Header.Set("Content-Type", ct)
	req.Header.Set("Authorization", "Bearer "+token)
	if rec := serve(r, req); rec.Code != 413 {
		t.Errorf("7 MB streamed multipart: %d %s", rec.Code, rec.Body)
	}
}

func multipartBody(t *testing.T, fields form, photo []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if photo != nil {
		// The declared type and name are deliberately misleading: the server sniffs the content.
		fw, err := w.CreateFormFile("photo", "../../evil.png")
		if err != nil {
			t.Fatal(err)
		}
		_, _ = fw.Write(photo)
	}
	w.Close()
	return &buf, w.FormDataContentType()
}

func TestPhotoUploads(t *testing.T) {
	resetDB(t)
	r, _ := platformRouter(t)
	token := tokenFor(t, carol)
	upload := func(photo []byte) *httptest.ResponseRecorder {
		body, ct := multipartBody(t, form{"name": "Pic", "status": "alive"}, photo)
		req := httptest.NewRequest("POST", "/api/trees/"+treeB+"/people", body)
		req.Header.Set("Content-Type", ct)
		req.Header.Set("Authorization", "Bearer "+token)
		return serve(r, req)
	}

	if rec := upload([]byte("<html><script>alert(1)</script></html>")); rec.Code != 400 {
		t.Errorf("html as photo: %d %s", rec.Code, rec.Body)
	}
	if rec := upload(append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 5<<20)...)); rec.Code != 413 {
		t.Errorf("oversized photo: %d %s", rec.Code, rec.Body)
	}

	var img bytes.Buffer
	m := image.NewRGBA(image.Rect(0, 0, 2, 2))
	m.Set(0, 0, color.RGBA{255, 0, 0, 255})
	if err := png.Encode(&img, m); err != nil {
		t.Fatal(err)
	}
	rec := upload(img.Bytes())
	var out struct {
		Data Person `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if rec.Code != 200 || !strings.HasPrefix(out.Data.PhotoURL, "/uploads/") || !strings.HasSuffix(out.Data.PhotoURL, ".png") || strings.Contains(out.Data.PhotoURL, "evil") {
		t.Fatalf("png upload: %d %s", rec.Code, rec.Body)
	}
	got := serve(r, httptest.NewRequest("GET", out.Data.PhotoURL, nil))
	if got.Code != 200 || got.Header().Get("Content-Type") != "image/png" || !bytes.Equal(got.Body.Bytes(), img.Bytes()) {
		t.Errorf("serving upload: %d %q", got.Code, got.Header().Get("Content-Type"))
	}
	for _, path := range []string{"/uploads/", "/uploads/../go.mod", "/uploads/%2e%2e/go.mod"} {
		if got := serve(r, httptest.NewRequest("GET", path, nil)); got.Code == 200 {
			t.Errorf("%s served: %s", path, got.Body)
		}
	}
}
