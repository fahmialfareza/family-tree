package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"runtime/debug"
	"strings"
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

// quotaScript counts a request in a sliding window only when it is allowed, atomically, so refused requests
// (and retries after a refusal) don't use up the quota.
var quotaScript = redis.NewScript(`
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
if redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call("ZADD", KEYS[1], ARGV[2], ARGV[4])
redis.call("PEXPIRE", KEYS[1], ARGV[5])
return 1`)

// quotaAllow is rateLimitAllow for usage quotas (the AI assistant): only allowed requests count. Login and
// other abuse limits keep rateLimitAllow, where every attempt counts.
func quotaAllow(ctx context.Context, key string, max int, per time.Duration) (bool, error) {
	if RedisClient == nil {
		return true, nil
	}
	defer newrelic.FromContext(ctx).StartSegment("middleware/Quota").End()
	now := time.Now()
	member := fmt.Sprintf("%d-%d", now.UnixNano(), rand.Int64())
	ok, err := quotaScript.Run(ctx, RedisClient, []string{redisKeyPrefix + "quota:" + key},
		now.Add(-per).UnixMilli(), now.UnixMilli(), max, member, (per + 5*time.Second).Milliseconds()).Int()
	return ok == 1, err
}

// limitQuota is limitByKey for usage quotas: it writes the 429 (or 503) and returns false when over.
func limitQuota(c *gin.Context, key string, max int, per time.Duration) bool {
	ok, err := quotaAllow(c, key, max, per)
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

// RateLimitMiddleware limits requests per client IP. failClosed rejects requests (503) when Redis errors;
// general traffic fails open so a Redis outage does not take the whole API down.
func RateLimitMiddleware(name string, max int, per time.Duration, failClosed bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, err := rateLimitAllow(c, name+":ip:"+clientIP(c), max, per)
		if err != nil {
			if failClosed {
				c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"message": "Service temporarily unavailable", "status": http.StatusServiceUnavailable})
				return
			}
			slog.WarnContext(c, "rate limiter unavailable", "request_id", requestID(c), "error", err)
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
				slog.ErrorContext(c, "panic", "request_id", requestID(c), "panic", fmt.Sprint(r), "stack", string(debug.Stack()))
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"message": "Internal Server Error", "status": http.StatusInternalServerError})
			}
		}()
		c.Next()
	}
}

// SecurityHeadersMiddleware sets headers for a JSON API that is never framed or rendered as a page.
func SecurityHeadersMiddleware() gin.HandlerFunc {
	production := IsProduction()
	return func(c *gin.Context) {
		h := c.Writer.Header()
		if production {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Cross-Origin-Resource-Policy", "same-site")
		c.Next()
	}
}

const (
	maxJSONBodyBytes      = 1 << 20 // JSON and other non-multipart bodies
	maxMultipartBodyBytes = 6 << 20 // person forms with a photo (photos are capped at 5 MB)
)

const bodyTooLargeKey = "bodyTooLarge"

// limitedBody records when the wrapped http.MaxBytesReader hit its limit, so the error response can say 413.
type limitedBody struct {
	io.ReadCloser
	exceeded *bool
}

func (b limitedBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		*b.exceeded = true
	}
	return n, err
}

// BodyLimitMiddleware caps request bodies: 1 MB, or 6 MB for multipart forms. Bodies that declare a larger
// Content-Length are rejected with 413 before anything is read; streamed bodies are cut off by
// http.MaxBytesReader and the handler's error response is turned into a 413 (see responseError).
func BodyLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body == nil || c.Request.Body == http.NoBody {
			c.Next()
			return
		}
		limit := int64(maxJSONBodyBytes)
		if strings.HasPrefix(strings.ToLower(c.ContentType()), "multipart/") {
			limit = maxMultipartBodyBytes
		}
		if c.Request.ContentLength > limit {
			abortTooLarge(c)
			return
		}
		exceeded := new(bool)
		c.Set(bodyTooLargeKey, exceeded)
		c.Request.Body = limitedBody{ReadCloser: http.MaxBytesReader(c.Writer, c.Request.Body, limit), exceeded: exceeded}
		c.Next()
	}
}

func abortTooLarge(c *gin.Context) {
	c.Header("Connection", "close")
	c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"message": "Request body too large", "status": http.StatusRequestEntityTooLarge})
}

// bodyWasTooLarge reports whether the request body was cut off by BodyLimitMiddleware.
func bodyWasTooLarge(c *gin.Context) bool {
	v, ok := c.Get(bodyTooLargeKey)
	if !ok {
		return false
	}
	exceeded, _ := v.(*bool)
	return exceeded != nil && *exceeded
}
