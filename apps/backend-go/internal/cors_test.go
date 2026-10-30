package app

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAllowedOriginsAcceptsAppOrigins(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://sakdulur.com/, TAURI://localhost, http://tauri.localhost")
	got, err := AllowedOrigins()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"https://sakdulur.com", "tauri://localhost", "http://tauri.localhost"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
	for _, bad := range []string{"tauri://evil.example", "ftp://localhost", "*", "https://sakdulur.com/app"} {
		t.Setenv("ALLOWED_ORIGINS", bad)
		if _, err := AllowedOrigins(); err == nil {
			t.Errorf("%q: want an error", bad)
		}
	}
}

func TestCORSPreflightFromApp(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("ALLOWED_ORIGINS", "http://localhost:3000,tauri://localhost")
	t.Setenv("CLOUDINARY_URL", "")
	t.Setenv("UPLOAD_DIR", t.TempDir())
	r, err := NewRouter(nil)
	if err != nil {
		t.Fatal(err)
	}
	for origin, allowed := range map[string]bool{"tauri://localhost": true, "tauri://evil.example": false} {
		req := httptest.NewRequest(http.MethodOptions, "/api/me", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", http.MethodGet)
		req.Header.Set("Access-Control-Request-Headers", "authorization,x-locale")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if got := w.Header().Get("Access-Control-Allow-Origin") == origin; got != allowed {
			t.Errorf("%s: allowed=%v, want %v (status %d)", origin, got, allowed, w.Code)
		}
	}
}
