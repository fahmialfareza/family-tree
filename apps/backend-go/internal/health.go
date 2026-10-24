package app

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// healthz is the liveness probe: the process is up and serving.
func healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// readyz is the readiness probe: Postgres and (when configured) Redis answer within 2 seconds.
// Failures only report which dependency is down, never the error text.
func readyz(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	checks := gin.H{}
	ready := true
	checks["postgres"] = "ok"
	if DB == nil {
		checks["postgres"], ready = "unavailable", false
	} else if sqlDB, err := DB.DB(); err != nil || sqlDB.PingContext(ctx) != nil {
		checks["postgres"], ready = "unavailable", false
	}
	if RedisClient != nil {
		checks["redis"] = "ok"
		if err := RedisClient.Ping(ctx).Err(); err != nil {
			checks["redis"], ready = "unavailable", false
		}
	}
	if !ready {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable", "checks": checks})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "checks": checks})
}
