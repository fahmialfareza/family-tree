package app

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/newrelic/go-agent/v3/newrelic"
)

const (
	cacheTTLUser          = 5 * time.Minute
	cacheTTLPerson        = 10 * time.Minute
	cacheTTLPeople        = 5 * time.Minute
	cacheTTLRelationships = 10 * time.Minute
	cacheTTLFamilies      = 5 * time.Minute
	cacheTTLFamily        = 10 * time.Minute
	cacheTTLUsers         = 5 * time.Minute
)

// redisKeyPrefix namespaces every Redis key written by this service.
const redisKeyPrefix = "family-tree:"

func cacheKeyUser(id string) string    { return redisKeyPrefix + "user:" + id }
func cacheKeyUsername(u string) string { return redisKeyPrefix + "username:" + u }

// cacheKeyUsersList is the cache key for the non-admin user list (role=user, not deleted).
// Scoped to the single call site in repoFindUsers — do not reuse for other filters.
func cacheKeyUsersList() string { return redisKeyPrefix + "users:list" }

func cacheKeyPerson(id string) string {
	return redisKeyPrefix + "person:" + id
}

func cacheKeyPeople(ownedBy []string) string {
	if len(ownedBy) == 0 {
		return redisKeyPrefix + "people:all"
	}
	sorted := make([]string, len(ownedBy))
	copy(sorted, ownedBy)
	sort.Strings(sorted)
	return redisKeyPrefix + "people:users:" + strings.Join(sorted, ",")
}

func cacheKeyRelationships(personID string) string {
	return redisKeyPrefix + "relationships:" + personID
}

func cacheKeyFamilies(ownedBy []string) string {
	if len(ownedBy) == 0 {
		return redisKeyPrefix + "families:all"
	}
	sorted := make([]string, len(ownedBy))
	copy(sorted, ownedBy)
	sort.Strings(sorted)
	return redisKeyPrefix + "families:users:" + strings.Join(sorted, ",")
}

func cacheKeyFamily(id string) string { return redisKeyPrefix + "family:" + id }

// cacheGet deserializes a cached value. Returns (value, true) on hit, zero+false on miss.
func cacheGet[T any](ctx context.Context, key string) (T, bool) {
	defer newrelic.StartSegment(newrelic.FromContext(ctx), "cache/get").End()
	var zero T
	if RedisClient == nil {
		return zero, false
	}
	data, err := RedisClient.Get(ctx, key).Bytes()
	if err != nil {
		return zero, false
	}
	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return zero, false
	}
	return result, true
}

// cacheSet serializes and stores a value with the given TTL. Silently skips if Redis is unavailable.
func cacheSet(ctx context.Context, key string, value any, ttl time.Duration) {
	defer newrelic.StartSegment(newrelic.FromContext(ctx), "cache/set").End()
	if RedisClient == nil {
		return
	}
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	RedisClient.Set(ctx, key, data, ttl)
}

// cacheDel removes one or more exact keys.
func cacheDel(ctx context.Context, keys ...string) {
	defer newrelic.StartSegment(newrelic.FromContext(ctx), "cache/del").End()
	if RedisClient == nil || len(keys) == 0 {
		return
	}
	RedisClient.Del(ctx, keys...)
}

// cacheDelPattern removes all keys matching the given glob pattern via SCAN+DEL.
func cacheDelPattern(ctx context.Context, pattern string) {
	defer newrelic.StartSegment(newrelic.FromContext(ctx), "cache/del-pattern").End()
	if RedisClient == nil {
		return
	}
	var cursor uint64
	for {
		keys, cur, err := RedisClient.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			break
		}
		if len(keys) > 0 {
			RedisClient.Del(ctx, keys...)
		}
		cursor = cur
		if cursor == 0 {
			break
		}
	}
}
