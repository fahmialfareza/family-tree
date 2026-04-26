package app

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	nrredis "github.com/newrelic/go-agent/v3/integrations/nrredis-v9"
	"github.com/newrelic/go-agent/v3/newrelic"
	"github.com/redis/go-redis/v9"
)

// hppMiddleware removes duplicate query parameters keeping first occurrence
func HPPMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		q := c.Request.URL.Query()
		for k, v := range q {
			if len(v) > 1 {
				q[k] = []string{v[0]}
			}
		}
		c.Request.URL.RawQuery = q.Encode()
		c.Next()
	}
}

// RateLimitMiddleware is a Redis-backed sliding-window rate limiter per IP.
// redisURL is captured once at middleware creation time; the 4 Redis operations
// are pipelined into a single round trip on every request.
func RateLimitMiddleware(max int, per time.Duration) gin.HandlerFunc {
	redisURL := os.Getenv("REDIS_URL")
	return func(c *gin.Context) {
		if redisURL == "" || RedisClient == nil {
			c.Next()
			return
		}
		defer newrelic.StartSegment(newrelic.FromContext(c.Request.Context()), "middleware/RateLimit").End()

		ip := c.ClientIP()
		now := time.Now().Unix()
		windowSec := int64(per.Seconds())
		key := "rl:sz:" + ip
		maxScore := fmt.Sprintf("%d", now-windowSec)
		member := fmt.Sprintf("%d-%d", now, time.Now().UnixNano()%1000)

		// pipeline: remove stale entries, add current, set TTL, count — 1 round trip
		pipe := RedisClient.Pipeline()
		pipe.ZRemRangeByScore(c, key, "-inf", maxScore)
		pipe.ZAdd(c, key, redis.Z{Score: float64(now), Member: member})
		pipe.Expire(c, key, per+5*time.Second)
		zCardCmd := pipe.ZCard(c, key)
		if _, err := pipe.Exec(c); err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "rate limiter unavailable", "status": http.StatusServiceUnavailable})
			return
		}

		if zCardCmd.Val() > int64(max) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"message": "Too many requests", "status": http.StatusTooManyRequests})
			return
		}
		c.Next()
	}
}

// nrredisHook returns a New Relic datastore hook for Redis.
// Pass opts from redis.ParseURL so segments carry connection details.
func nrredisHook(opts *redis.Options) redis.Hook {
	return nrredis.NewHook(opts)
}
