package app

import (
	"context"
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
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

// rateLimitAllow records one hit for key in a Redis sliding window and reports whether it is within max per window.
// The four Redis operations are pipelined into one round trip. Without Redis, everything is allowed.
func rateLimitAllow(ctx context.Context, key string, max int, per time.Duration) (bool, error) {
	if RedisClient == nil {
		return true, nil
	}
	defer newrelic.FromContext(ctx).StartSegment("middleware/RateLimit").End()
	now := time.Now()
	key = redisKeyPrefix + "rl:" + key
	member := fmt.Sprintf("%d-%d", now.UnixNano(), rand.Int64())
	pipe := RedisClient.Pipeline()
	pipe.ZRemRangeByScore(ctx, key, "-inf", fmt.Sprintf("%d", now.Add(-per).UnixMilli()))
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(now.UnixMilli()), Member: member})
	pipe.Expire(ctx, key, per+5*time.Second)
	count := pipe.ZCard(ctx, key)
	if _, err := pipe.Exec(ctx); err != nil {
		return false, err
	}
	return count.Val() <= int64(max), nil
}

// RateLimitMiddleware limits requests per client IP. failClosed rejects requests (503) when Redis errors;
// general traffic fails open so a Redis outage does not take the whole API down.
func RateLimitMiddleware(name string, max int, per time.Duration, failClosed bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, err := rateLimitAllow(c, name+":ip:"+c.ClientIP(), max, per)
		if err != nil {
			if failClosed {
				c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "Service temporarily unavailable", "status": http.StatusServiceUnavailable})
				return
			}
			log.Printf("rate limiter unavailable: %v", err)
			c.Next()
			return
		}
		if !ok {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"message": "Too many requests", "status": http.StatusTooManyRequests})
			return
		}
		c.Next()
	}
}

// limitByKey applies a per-key limit inside a handler (e.g. per account on login). It writes the
// response and returns false when the request must stop. Fails closed: used on auth endpoints only.
func limitByKey(c *gin.Context, key string, max int, per time.Duration) bool {
	ok, err := rateLimitAllow(c, key, max, per)
	if err != nil {
		responseError(c, "Service temporarily unavailable", http.StatusServiceUnavailable)
		return false
	}
	if !ok {
		responseError(c, "Too many attempts, please try again later", http.StatusTooManyRequests)
		return false
	}
	return true
}

// PanicRecoveryMiddleware catches any unhandled panic, reports it to New Relic,
// and returns a 500 so the server keeps running.
func PanicRecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				txn := newrelic.FromContext(c.Request.Context())
				txn.NoticeError(fmt.Errorf("panic: %v", r))
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"message": "Internal Server Error", "status": http.StatusInternalServerError})
			}
		}()
		c.Next()
	}
}
