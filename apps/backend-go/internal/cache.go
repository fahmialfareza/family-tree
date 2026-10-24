package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/newrelic/go-agent/v3/newrelic"
)

const (
	cacheTTLPerson        = 10 * time.Minute
	cacheTTLPeople        = 5 * time.Minute
	cacheTTLRelationships = 10 * time.Minute
	cacheTTLFamilies      = 5 * time.Minute
	cacheTTLFamily        = 10 * time.Minute
	// cacheTTLTreeVersion outlives every data TTL so an expired version key can never resurrect stale entries.
	cacheTTLTreeVersion = 24 * time.Hour
)

// redisKeyPrefix namespaces every Redis key written by this service.
const redisKeyPrefix = "family-tree:"

// Tree data is cached under a per-tree version: tree:{id}:v{n}:<suffix>. Any write in a tree bumps n
// (bumpTreeCache), which invalidates everything cached for that tree at once; old entries expire by TTL.

func cacheKeyTreeVersion(treeID string) string { return redisKeyPrefix + "tree:" + treeID + ":ver" }

func treeCacheKey(ctx context.Context, treeID, suffix string) string {
	version := "0"
	if RedisClient != nil {
		if v, err := RedisClient.Get(ctx, cacheKeyTreeVersion(treeID)).Result(); err == nil {
			version = v
		}
	}
	return fmt.Sprintf("%stree:%s:v%s:%s", redisKeyPrefix, treeID, version, suffix)
}

// bumpTreeCache invalidates every cached entry for the tree.
func bumpTreeCache(ctx context.Context, treeID string) {
	defer newrelic.FromContext(ctx).StartSegment("cache/bump-tree").End()
	if RedisClient == nil || treeID == "" {
		return
	}
	key := cacheKeyTreeVersion(treeID)
	pipe := RedisClient.Pipeline()
	pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, cacheTTLTreeVersion)
	_, _ = pipe.Exec(ctx)
}

func cacheSuffixPerson(id string) string        { return "person:" + id }
func cacheSuffixRelationships(id string) string { return "relationships:" + id }
func cacheSuffixFamily(id string) string        { return "family:" + id }

// cacheSuffixList names a people/families list; ownedBy nil means the whole tree.
func cacheSuffixList(kind string, ownedBy []string) string {
	if len(ownedBy) == 0 {
		return kind + ":all"
	}
	sorted := make([]string, len(ownedBy))
	copy(sorted, ownedBy)
	sort.Strings(sorted)
	return kind + ":users:" + strings.Join(sorted, ",")
}

// cacheGet deserializes a cached value. Returns (value, true) on hit, zero+false on miss.
func cacheGet[T any](ctx context.Context, key string) (T, bool) {
	defer newrelic.FromContext(ctx).StartSegment("cache/get").End()
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
	defer newrelic.FromContext(ctx).StartSegment("cache/set").End()
	if RedisClient == nil {
		return
	}
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	RedisClient.Set(ctx, key, data, ttl)
}
