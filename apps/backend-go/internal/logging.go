package app

import (
	"log/slog"
	"os"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// treeDebug enables verbose tree/relationship debug logs (TREE_DEBUG=1).
func treeDebug() bool { return os.Getenv("TREE_DEBUG") == "1" }

// InitLogger installs the default slog logger: JSON in production, text elsewhere. Debug level is only
// enabled with TREE_DEBUG=1. The standard log package is routed through it as well.
func InitLogger() {
	level := slog.LevelInfo
	if treeDebug() {
		level = slog.LevelDebug
	}
	opts := &slog.HandlerOptions{Level: level}
	var handler slog.Handler
	if IsProduction() {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(handler))
}

const requestIDHeader = "X-Request-ID"

// validRequestID accepts the IDs proxies commonly send (UUIDs, hex, base64url) and nothing that could
// break a log line or header.
var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)

// RequestIDMiddleware reuses a sane incoming X-Request-ID or generates one, and echoes it in the response.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(requestIDHeader)
		if !validRequestID.MatchString(id) {
			id = uuid.Must(uuid.NewV7()).String()
		}
		c.Set("requestId", id)
		c.Header(requestIDHeader, id)
		c.Next()
	}
}

func requestID(c *gin.Context) string { return c.GetString("requestId") }

// AccessLogMiddleware writes one log line per request. It never logs query strings, headers or bodies,
// which can carry tokens and email addresses. Health probes are skipped.
func AccessLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		path := c.Request.URL.Path
		if path == "/healthz" || path == "/readyz" {
			return
		}
		status := c.Writer.Status()
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelError
		}
		slog.LogAttrs(c.Request.Context(), level, "request",
			slog.String("method", c.Request.Method),
			slog.String("path", path),
			slog.Int("status", status),
			slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
			slog.String("request_id", requestID(c)),
			slog.String("client_ip", clientIP(c)),
		)
	}
}
