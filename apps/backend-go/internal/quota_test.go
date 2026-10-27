package app

import (
	"context"
	"testing"
	"time"
)

// Usage quotas count allowed requests only: retrying after a refusal must not keep the user locked out.
func TestQuotaCountsAllowedRequestsOnly(t *testing.T) {
	if RedisClient == nil {
		t.Skip("TEST_REDIS_URL is not set")
	}
	ctx := context.Background()
	key := "test:quota:" + time.Now().Format("150405.000000000")
	t.Cleanup(func() { RedisClient.Del(ctx, redisKeyPrefix+"quota:"+key) })

	for i := 1; i <= 3; i++ {
		if ok, err := quotaAllow(ctx, key, 3, time.Second); err != nil || !ok {
			t.Fatalf("request %d: allowed=%v err=%v, want allowed", i, ok, err)
		}
	}
	for i := 0; i < 5; i++ {
		if ok, _ := quotaAllow(ctx, key, 3, time.Second); ok {
			t.Fatalf("refused retry %d was allowed", i+1)
		}
	}
	if n := RedisClient.ZCard(ctx, redisKeyPrefix+"quota:"+key).Val(); n != 3 {
		t.Fatalf("window holds %d requests, want the 3 allowed ones", n)
	}
	// Once the allowed requests leave the window, the next one passes despite the refused retries.
	time.Sleep(1100 * time.Millisecond)
	if ok, err := quotaAllow(ctx, key, 3, time.Second); err != nil || !ok {
		t.Fatalf("after the window: allowed=%v err=%v, want allowed", ok, err)
	}
}
