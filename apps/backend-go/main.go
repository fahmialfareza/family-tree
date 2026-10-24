package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	app "github.com/fahmialfareza/family-tree/backend/internal"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/newrelic/go-agent/v3/integrations/nrgin"
)

func main() {
	// Load .env file if present — only attempt when the file exists.
	if _, err := os.Stat(".env"); err == nil {
		if err := godotenv.Load(); err != nil {
			log.Printf("warning: failed to load .env: %v", err)
		}
	}

	if app.IsProduction() {
		if err := app.CheckProductionConfig(); err != nil {
			log.Fatal(err)
		}
	}
	if err := app.InitAuth(); err != nil {
		log.Fatalf("auth config: %v", err)
	}
	app.InitMailer()

	// graceful shutdown example
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Initialize Postgres (required by repositories)
	if err := app.InitPostgres(ctx); err != nil {
		log.Fatalf("failed to init postgres: %v", err)
	}

	// Redis cache is optional
	app.InitRedis(ctx)

	// Apply pending SQL migrations (idempotent — safe to run on every startup)
	if err := app.InitSchema(context.Background()); err != nil {
		log.Fatalf("failed to init schema: %v", err)
	}

	// initialize New Relic if configured (non-fatal)
	nrApp, err := app.InitNewRelic()
	if err != nil {
		log.Printf("warning: newrelic init error: %v", err)
	}
	if nrApp != nil {
		log.Printf("newrelic enabled")
	}

	// Initialize Gin router
	r := gin.Default()

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
			log.Println("warning: neither TRUSTED_PROXIES nor CLIENT_IP_HEADER is set; X-Forwarded-For is trusted from any peer, so per-IP rate limits can be bypassed")
		}
	case "none":
		if err := r.SetTrustedProxies(nil); err != nil {
			log.Fatalf("TRUSTED_PROXIES: %v", err)
		}
	default:
		if err := r.SetTrustedProxies(strings.Split(proxies, ",")); err != nil {
			log.Fatalf("invalid TRUSTED_PROXIES: %v", err)
		}
	}

	// CORS
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowHeaders = []string{"Accept", "Content-Type", "Content-Length", "Accept-Encoding", "Authorization", "Cache-Control", "Referer", "x-requested-with", "ngrok-skip-browser-warning"}
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.ExposeHeaders = []string{"Content-Type", "Cache-Control"}

	r.Use(cors.New(config))

	// New Relic middleware — must be registered before PanicRecovery so txn is in context
	r.Use(nrgin.Middleware(nrApp))

	// Panic recovery — reports panics to New Relic and returns 500
	r.Use(app.PanicRecoveryMiddleware())

	// Compression
	r.Use(gzip.Gzip(gzip.DefaultCompression))

	// HPP (simple implementation) and rate limiter
	r.Use(app.HPPMiddleware())
	r.Use(app.RateLimitMiddleware("global", 600, time.Minute, false))

	// Set upload limit (100 MB)
	r.MaxMultipartMemory = 100 << 20 // 100 MB

	app.RegisterRoutes(r)

	// catch-all for not found
	r.NoRoute(func(c *gin.Context) {
		c.JSON(404, gin.H{"message": "Not Found", "status": 404})
	})

	// Load envs from os
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	log.Printf("listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
