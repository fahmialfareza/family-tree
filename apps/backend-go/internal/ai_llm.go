package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/newrelic/go-agent/v3/newrelic"
)

// Gemini and Groq behind one OpenAI-compatible Chat Completions call (same approach as catetin.ai): the
// Gemini models are tried first, then Groq. A model that is rate limited, down or unknown is skipped for a
// while (cooldown), so one bad provider does not slow every question. Each provider is enabled by its API
// key; the model lists come from the environment.

type aiProvider struct {
	Name    string
	BaseURL string
	APIKey  string
	Models  []string
}

type aiAttempt struct {
	Provider *aiProvider
	Model    string
}

func (a aiAttempt) String() string { return a.Provider.Name + "/" + a.Model }

const (
	aiCooldownRateLimit   = time.Minute
	aiCooldownServerError = 30 * time.Second
	aiCooldownUnknown     = 6 * time.Hour // model not found / no access: probably a config mistake
	aiCooldownMax         = 24 * time.Hour
)

func envList(key, def string) []string {
	v := os.Getenv(key)
	if strings.TrimSpace(v) == "" {
		v = def
	}
	var out []string
	for _, m := range strings.Split(v, ",") {
		if m = strings.TrimSpace(m); m != "" {
			out = append(out, m)
		}
	}
	return out
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// aiProviders returns the configured providers in fallback order.
func aiProviders() []*aiProvider {
	var out []*aiProvider
	add := func(name, keyEnv, baseEnv, baseDef, modelsEnv, modelsDef string) {
		key := strings.TrimSpace(os.Getenv(keyEnv))
		if key == "" {
			return
		}
		models := envList(modelsEnv, modelsDef)
		if len(models) == 0 {
			return
		}
		out = append(out, &aiProvider{Name: name, APIKey: key, BaseURL: strings.TrimRight(envOr(baseEnv, baseDef), "/"), Models: models})
	}
	add("gemini", "GEMINI_API_KEY", "AI_GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai",
		"AI_GEMINI_MODELS", "gemini-3.8-flash,gemini-3.5-flash-lite")
	add("groq", "GROQ_API_KEY", "AI_GROQ_BASE_URL", "https://api.groq.com/openai/v1",
		"AI_GROQ_MODELS", "openai/gpt-oss-120b,qwen/qwen3.8-27b")
	return out
}

func assistantConfigured() bool { return len(aiProviders()) > 0 }

func aiAttempts() []aiAttempt {
	var out []aiAttempt
	for _, p := range aiProviders() {
		for _, m := range p.Models {
			out = append(out, aiAttempt{Provider: p, Model: m})
		}
	}
	return out
}

// aiCallTimeout caps one Chat Completions call. It is per call, not per model: a tool loop makes several
// calls, and a model that is slow overall but answering each round should not lose its work.
func aiCallTimeout() time.Duration {
	if d, err := time.ParseDuration(os.Getenv("AI_PROVIDER_TIMEOUT")); err == nil && d > 0 {
		return d
	}
	return 25 * time.Second
}

// ---- Chat Completions wire format (only what the assistant uses) ----

type chatMessage struct {
	Role    string  `json:"role"`
	Content *string `json:"content"`
	// Tool calls are kept as raw JSON so provider extras survive the round trip (Gemini 3 rejects a
	// follow-up whose tool calls lost their extra_content.google.thought_signature).
	ToolCalls  []json.RawMessage `json:"tool_calls,omitempty"`
	ToolCallID string            `json:"tool_call_id,omitempty"`
}

func textMessage(role, text string) chatMessage { return chatMessage{Role: role, Content: &text} }

type chatTool struct {
	Type     string       `json:"type"`
	Function chatFunction `json:"function"`
}

type chatFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Tools       []chatTool    `json:"tools,omitempty"`
	ToolChoice  string        `json:"tool_choice,omitempty"`
	Temperature *float64      `json:"temperature,omitempty"`
	// Set per model in chatComplete.
	ReasoningEffort string `json:"reasoning_effort,omitempty"`
	ReasoningFormat string `json:"reasoning_format,omitempty"`
}

type toolCall struct {
	ID       string `json:"id"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type chatResponse struct {
	Choices []struct {
		Message      chatMessage `json:"message"`
		FinishReason string      `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// aiHTTPError carries the provider's status so failures can be classified for cooldowns.
type aiHTTPError struct {
	Status     int
	RetryAfter time.Duration
	Body       string
}

func (e *aiHTTPError) Error() string {
	return fmt.Sprintf("ai provider status %d: %s", e.Status, truncate(e.Body, 300))
}

var (
	aiHTTPClient    = &http.Client{Transport: newrelic.NewRoundTripper(nil)}
	geminiRetryHint = regexp.MustCompile(`"retryDelay"\s*:\s*"(\d+)(?:\.\d+)?s"`)
	errAIEmpty      = errors.New("empty response from AI provider")
)

func chatComplete(ctx context.Context, a aiAttempt, req chatRequest) (*chatResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, aiCallTimeout())
	defer cancel()
	req.Model = a.Model
	req.ReasoningEffort = aiReasoningEffort(a)
	// Groq's other reasoning models (e.g. Qwen) otherwise put their thinking in the content.
	if a.Provider.Name == "groq" && !strings.Contains(strings.ToLower(a.Model), "gpt-oss") {
		req.ReasoningFormat = "hidden"
	}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.Provider.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.Provider.APIKey)
	res, err := aiHTTPClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		e := &aiHTTPError{Status: res.StatusCode, Body: string(raw)}
		if s, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil {
			e.RetryAfter = time.Duration(s) * time.Second
		} else if m := geminiRetryHint.FindStringSubmatch(e.Body); m != nil {
			s, _ := strconv.Atoi(m[1])
			e.RetryAfter = time.Duration(s) * time.Second
		}
		return nil, e
	}
	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if len(out.Choices) == 0 {
		return nil, errAIEmpty
	}
	return &out, nil
}

// aiReasoningEffort keeps thinking short: the tool loop makes several calls per question, and each round's
// thinking is most of its latency. Values are what each model accepts (same mapping as catetin.ai).
func aiReasoningEffort(a aiAttempt) string {
	model := strings.ToLower(a.Model)
	switch {
	case a.Provider.Name == "gemini" && (strings.HasPrefix(model, "gemini-") || strings.HasPrefix(model, "gemma-")):
		return "minimal" // Gemma rejects "none"
	case a.Provider.Name == "groq" && strings.Contains(model, "gpt-oss"):
		return "low"
	case a.Provider.Name == "groq" && strings.HasPrefix(model, "qwen/"):
		return "none"
	}
	return ""
}

// ---- Cooldowns: Redis when available (shared across instances), memory otherwise ----

var aiLocalCooldowns sync.Map // attempt key -> time.Time

func aiCooldownKey(a aiAttempt) string { return redisKeyPrefix + "ai:cooldown:" + a.String() }

func aiCoolingDown(ctx context.Context, a aiAttempt) bool {
	if RedisClient != nil {
		n, err := RedisClient.Exists(ctx, aiCooldownKey(a)).Result()
		if err == nil {
			return n > 0
		}
	}
	if until, ok := aiLocalCooldowns.Load(a.String()); ok {
		return time.Now().Before(until.(time.Time))
	}
	return false
}

func setAICooldown(ctx context.Context, a aiAttempt, d time.Duration) {
	d = min(d, aiCooldownMax)
	if RedisClient != nil && RedisClient.Set(ctx, aiCooldownKey(a), "1", d).Err() == nil {
		return
	}
	aiLocalCooldowns.Store(a.String(), time.Now().Add(d))
}

// aiFailureCooldown decides how long to skip a model after err (0 = try it again next time).
func aiFailureCooldown(err error) time.Duration {
	var he *aiHTTPError
	if errors.As(err, &he) {
		switch {
		case he.Status == http.StatusTooManyRequests:
			return max(he.RetryAfter, aiCooldownRateLimit)
		case he.Status == http.StatusNotFound || he.Status == http.StatusUnauthorized || he.Status == http.StatusForbidden:
			return aiCooldownUnknown
		case he.Status >= 500:
			return aiCooldownServerError
		}
		return 0 // 400 & co: this request, not the model
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return aiCooldownServerError
	}
	return 0
}

var errAIUnavailable = errors.New("no AI provider could answer")

// runWithFallback runs fn with each available model in order until one succeeds. Each call inside fn is
// capped by aiCallTimeout; ctx bounds the whole question. The whole conversation is retried on the next model, so tool-call messages
// from one provider are never sent to another.
func runWithFallback[T any](ctx context.Context, fn func(ctx context.Context, a aiAttempt) (T, error)) (T, aiAttempt, error) {
	var zero T
	if _, ok := ctx.Value(lfTraceKey{}).(lfTraceAttributes); !ok {
		// Every model call belongs to a named trace, even when the caller did not open one.
		var endTrace func(error)
		ctx, _, endTrace = startAITrace(ctx, "ai-assistant", "", nil)
		defer func() { endTrace(nil) }()
	}
	attempts := aiAttempts()
	tried := 0
	for _, a := range attempts {
		if ctx.Err() != nil {
			break
		}
		if aiCoolingDown(ctx, a) {
			continue
		}
		tried++
		attemptCtx, endAttempt := startAIAttempt(ctx, a, tried)
		start := time.Now()
		out, err := fn(attemptCtx, a)
		endAttempt(err)
		if err == nil {
			return out, a, nil
		}
		if ctx.Err() != nil {
			break
		}
		if d := aiFailureCooldown(err); d > 0 {
			setAICooldown(ctx, a, d)
		}
		slog.WarnContext(ctx, "ai attempt failed", "model", a.String(), "ms", time.Since(start).Milliseconds(), "error", truncate(err.Error(), 300))
	}
	if len(attempts) == 0 {
		return zero, aiAttempt{}, errAIUnavailable
	}
	if ctx.Err() != nil {
		return zero, aiAttempt{}, ctx.Err()
	}
	return zero, aiAttempt{}, errAIUnavailable
}
