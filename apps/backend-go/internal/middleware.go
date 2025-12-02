package app

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
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

// simple in-memory rate limiter per IP
func RateLimitMiddleware(max int, per time.Duration) gin.HandlerFunc {
	// Redis-backed sliding-window limiter using sorted sets
	// Requires REDIS_URL env (e.g. redis://localhost:6379)
	return func(c *gin.Context) {
		redisURL := os.Getenv("REDIS_URL")
		if redisURL == "" {
			// fallback: allow through (no redis configured)
			c.Next()
			return
		}
		ip := c.ClientIP()
		now := time.Now().Unix()
		windowSec := int64(per.Seconds())
		key := "rl:sz:" + ip

		// ensure Redis client exists
		if RedisClient == nil {
			opt, err := redis.ParseURL(redisURL)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "rate limiter unavailable", "status": http.StatusServiceUnavailable})
				return
			}
			RedisClient = redis.NewClient(opt)
		}

		// remove entries older than window
		min := "-inf"
		maxScore := fmt.Sprintf("%d", now-windowSec)
		// ZREMRANGEBYSCORE key -inf (now-window)
		if err := RedisClient.ZRemRangeByScore(c, key, min, maxScore).Err(); err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "rate limiter unavailable", "status": http.StatusServiceUnavailable})
			return
		}

		// add current timestamp as score and member (use timestamp+random to avoid dup)
		member := fmt.Sprintf("%d-%d", now, time.Now().UnixNano()%1000)
		if err := RedisClient.ZAdd(c, key, redis.Z{Score: float64(now), Member: member}).Err(); err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "rate limiter unavailable", "status": http.StatusServiceUnavailable})
			return
		}

		// set TTL slightly longer than window
		if err := RedisClient.Expire(c, key, per+time.Second*5).Err(); err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "rate limiter unavailable", "status": http.StatusServiceUnavailable})
			return
		}

		// get current count
		cnt, err := RedisClient.ZCard(c, key).Result()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "rate limiter unavailable", "status": http.StatusServiceUnavailable})
			return
		}
		if cnt > int64(max) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"message": "Too many requests", "status": http.StatusTooManyRequests})
			return
		}
		c.Next()
	}
}
