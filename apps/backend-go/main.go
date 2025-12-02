package main

import (
	"context"
	"log"
	"os"
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

	// graceful shutdown example
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Initialize MongoDB (required by repositories)
	if err := app.InitMongo(ctx); err != nil {
		log.Fatalf("failed to init mongo: %v", err)
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

	// CORS
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowHeaders = []string{"Accept", "Content-Type", "Content-Length", "Accept-Encoding", "Authorization", "Cache-Control", "Referer", "x-requested-with", "ngrok-skip-browser-warning"}
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.ExposeHeaders = []string{"Content-Type", "Cache-Control"}

	r.Use(cors.New(config))

	// New Relic middleware
	r.Use(nrgin.Middleware(nrApp))

	// Compression
	r.Use(gzip.Gzip(gzip.DefaultCompression))

	// HPP (simple implementation) and rate limiter
	r.Use(app.HPPMiddleware())
	r.Use(app.RateLimitMiddleware(600, time.Minute))

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
