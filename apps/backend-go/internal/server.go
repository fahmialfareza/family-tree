package app

import (
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/newrelic/go-agent/v3/integrations/nrgin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// NewRouter builds the HTTP handler with all middleware and routes. nrApp may be nil.
//
// Gin attaches middleware to routes when they are registered, so the health probes, registered before
// New Relic, the body limit and the rate limiter, are not traced or rate limited.
func NewRouter(nrApp *newrelic.Application) (*gin.Engine, error) {
	origins, err := AllowedOrigins()
	if err != nil {
		return nil, err
	}

	r := gin.New()
	// Buffer threshold for multipart forms, not a cap: BodyLimitMiddleware caps the body itself.
	r.MaxMultipartMemory = 8 << 20

	// Client IPs (rate limits, session records):
	//   CLIENT_IP_HEADER=X-Real-IP (or CF-Connecting-IP, ...) - a header the platform's edge always overwrites
	//   TRUSTED_PROXIES=10.0.0.0/8,... - X-Forwarded-For is honoured only from these peers
	//   TRUSTED_PROXIES=none           - always use the direct peer address
	if header := os.Getenv("CLIENT_IP_HEADER"); header != "" {
		r.TrustedPlatform = header
	}
	switch proxies := os.Getenv("TRUSTED_PROXIES"); proxies {
	case "":
		if os.Getenv("CLIENT_IP_HEADER") == "" {
			slog.Warn("neither TRUSTED_PROXIES nor CLIENT_IP_HEADER is set; X-Forwarded-For is trusted from any peer, so per-IP rate limits can be bypassed")
		}
	case "none":
		if err := r.SetTrustedProxies(nil); err != nil {
			return nil, err
		}
	default:
		if err := r.SetTrustedProxies(strings.Split(proxies, ",")); err != nil {
			return nil, err
		}
	}

	r.Use(BFFClientIPMiddleware(), RequestIDMiddleware(), AccessLogMiddleware(), SecurityHeadersMiddleware())

	r.GET("/healthz", healthz)
	r.GET("/readyz", readyz)

	// CORS: exact origins only. The web frontend calls the API server-side and the apps (apps/native) call it from
	// their own origin (tauri://localhost, http://tauri.localhost), both with bearer tokens, so no credentials.
	config := cors.DefaultConfig()
	config.AllowOrigins = origins
	config.CustomSchemas = []string{"tauri://"}
	config.AllowCredentials = false
	config.AllowHeaders = []string{"Accept", "Content-Type", "Content-Length", "Accept-Encoding", "Authorization", "Cache-Control", "Referer", "x-requested-with", "ngrok-skip-browser-warning", "X-Locale", requestIDHeader}
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.ExposeHeaders = []string{"Content-Type", "Cache-Control", "Content-Disposition", requestIDHeader}
	config.MaxAge = 12 * time.Hour
	// Sign in with Apple on the web returns with a form POST from Apple's page (oauth_apple_web.go).
	config.AllowOriginWithContextFunc = func(c *gin.Context, origin string) bool {
		return origin == appleOrigin && c.Request.Method == http.MethodPost && c.Request.URL.Path == appleCallbackPath
	}
	r.Use(cors.New(config))

	// New Relic middleware — must be registered before PanicRecovery so txn is in context
	r.Use(nrgin.Middleware(nrApp))

	// Panic recovery — reports panics to New Relic and returns 500
	r.Use(PanicRecoveryMiddleware())

	r.Use(BodyLimitMiddleware())
	r.Use(gzip.Gzip(gzip.DefaultCompression))

	// HPP (simple implementation) and rate limiter
	r.Use(HPPMiddleware())
	r.Use(RateLimitMiddleware("global", 600, time.Minute, false))

	RegisterRoutes(r)

	// Development photo uploads (no Cloudinary): served read-only from UPLOAD_DIR. gin.Dir wraps http.Dir,
	// which rejects ".." traversal, and listing is disabled. Names are server-generated UUIDs, content is
	// sniffed to JPEG/PNG/WebP on upload, and nosniff + CSP apply to these responses too.
	if localUploadsEnabled() {
		r.StaticFS("/uploads", gin.Dir(uploadDir(), false))
	}

	// catch-all for not found
	r.NoRoute(func(c *gin.Context) {
		c.JSON(404, gin.H{"message": "Not Found", "status": 404})
	})
	return r, nil
}
