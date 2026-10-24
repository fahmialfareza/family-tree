package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	app "github.com/fahmialfareza/family-tree/backend/internal"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "request /healthz on the local server and exit 0 (healthy) or 1")
	flag.Parse()

	// Load .env file if present — only attempt when the file exists.
	if _, err := os.Stat(".env"); err == nil {
		if err := godotenv.Load(); err != nil {
			slog.Warn("failed to load .env", "error", err)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}
	if *healthcheck {
		os.Exit(runHealthcheck(port))
	}

	app.InitLogger()
	if app.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
		if err := app.CheckProductionConfig(); err != nil {
			fatal("production config", err)
		}
	}
	if err := app.InitAuth(); err != nil {
		fatal("auth config", err)
	}
	app.InitMailer()

	// Startup deadline for connecting to Postgres and Redis.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Initialize Postgres (required by repositories)
	if err := app.InitPostgres(ctx); err != nil {
		fatal("failed to init postgres", err)
	}

	// Redis cache is optional
	app.InitRedis(ctx)

	// Apply pending SQL migrations (idempotent — safe to run on every startup)
	if err := app.InitSchema(context.Background()); err != nil {
		fatal("failed to init schema", err)
	}

	// initialize New Relic if configured (non-fatal)
	nrApp, err := app.InitNewRelic()
	if err != nil {
		slog.Warn("newrelic init error", "error", err)
	}
	if nrApp != nil {
		slog.Info("newrelic enabled")
	}

	router, err := app.NewRouter(nrApp)
	if err != nil {
		fatal("router config", err)
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// SIGINT/SIGTERM: stop accepting connections, let in-flight requests finish (up to 20s), then close
	// the database and Redis connections.
	stop, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()

	serveErr := make(chan error, 1)
	go func() {
		slog.Info("listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
		close(serveErr)
	}()

	select {
	case err := <-serveErr:
		if err != nil {
			app.CloseConnections()
			fatal("server error", err)
		}
	case <-stop.Done():
		slog.Info("shutting down")
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown incomplete", "error", err)
	}
	if nrApp != nil {
		nrApp.Shutdown(5 * time.Second)
	}
	app.CloseConnections()
	slog.Info("stopped")
}

// runHealthcheck backs the Docker HEALTHCHECK (the final image has no curl).
func runHealthcheck(port string) int {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func fatal(msg string, err error) {
	slog.Error(msg, "error", err)
	os.Exit(1)
}
