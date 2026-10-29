package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// Langfuse v4 tracing of the AI assistant over its OpenTelemetry endpoint (same approach as catetin.ai).
// Traces hold counts, models, token usage, timing and tool names only, never message text, tool arguments
// or tool results: the privacy policy promises the conversation is not stored.

const (
	langfuseServiceName    = "family-tree-backend"
	langfuseTracerName     = "github.com/fahmialfareza/family-tree/backend"
	langfuseOtelTracesPath = "/api/public/otel/v1/traces"
	langfuseDefaultBaseURL = "https://cloud.langfuse.com"
)

// Observation types and levels understood by Langfuse.
const (
	lfSpan       = "span"
	lfGeneration = "generation"
	lfTool       = "tool"

	lfLevelWarning = "WARNING"
	lfLevelError   = "ERROR"
)

var (
	lfProvider *sdktrace.TracerProvider
	lfTracer   trace.Tracer = noop.NewTracerProvider().Tracer(langfuseTracerName)
)

// InitLangfuse enables tracing when LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set; otherwise
// spans go to a no-op tracer. The provider is dedicated (not the global one), so nothing else reaches
// Langfuse.
func InitLangfuse() (bool, error) {
	publicKey := strings.TrimSpace(os.Getenv("LANGFUSE_PUBLIC_KEY"))
	secretKey := strings.TrimSpace(os.Getenv("LANGFUSE_SECRET_KEY"))
	if publicKey == "" || secretKey == "" {
		return false, nil
	}
	baseURL := strings.TrimRight(envOr("LANGFUSE_BASE_URL", langfuseDefaultBaseURL), "/")
	auth := base64.StdEncoding.EncodeToString([]byte(publicKey + ":" + secretKey))

	exporter, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpointURL(baseURL+langfuseOtelTracesPath),
		otlptracehttp.WithHeaders(map[string]string{
			"Authorization": "Basic " + auth,
			// Opts the OTLP endpoint into the Langfuse v4 ingestion path.
			"x-langfuse-ingestion-version": "4",
		}),
		otlptracehttp.WithCompression(otlptracehttp.GzipCompression),
		otlptracehttp.WithTimeout(10*time.Second),
	)
	if err != nil {
		return false, err
	}

	attrs := []attribute.KeyValue{attribute.String("service.name", langfuseServiceName)}
	if env := langfuseEnvironment(); env != "" {
		attrs = append(attrs, attribute.String("deployment.environment", env))
	}
	lfProvider = sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter, sdktrace.WithBatchTimeout(500*time.Millisecond)),
		sdktrace.WithResource(resource.NewSchemaless(attrs...)),
	)
	lfTracer = lfProvider.Tracer(langfuseTracerName)
	return true, nil
}

// ShutdownLangfuse flushes buffered spans; call it before the process exits.
func ShutdownLangfuse(ctx context.Context) error {
	if lfProvider == nil {
		return nil
	}
	return lfProvider.Shutdown(ctx)
}

func langfuseEnvironment() string {
	return strings.ToLower(envOr("LANGFUSE_TRACING_ENVIRONMENT", strings.TrimSpace(os.Getenv("APP_ENV"))))
}

// ---- Observations ----

type lfTraceAttributes struct {
	name   string
	userID string
}

type lfTraceKey struct{}

// lfStart begins an observation of the given type as a child of the span in ctx. Trace attributes stored
// on ctx are repeated on every observation (like propagate_attributes in the v4 SDKs), so user filters
// cover child generations too.
func lfStart(ctx context.Context, name, observationType string) (context.Context, trace.Span) {
	attrs := []attribute.KeyValue{attribute.String("langfuse.observation.type", observationType)}
	if ta, ok := ctx.Value(lfTraceKey{}).(lfTraceAttributes); ok {
		if ta.name != "" {
			attrs = append(attrs, attribute.String("langfuse.trace.name", ta.name))
		}
		if ta.userID != "" {
			attrs = append(attrs, attribute.String("user.id", ta.userID), attribute.String("langfuse.user.id", ta.userID))
		}
	}
	if env := langfuseEnvironment(); env != "" {
		attrs = append(attrs, attribute.String("langfuse.environment", env))
	}
	return lfTracer.Start(ctx, name, trace.WithAttributes(attrs...))
}

func lfSetInput(span trace.Span, input any) {
	span.SetAttributes(attribute.String("langfuse.observation.input", lfJSON(input)))
}

func lfSetOutput(span trace.Span, output any) {
	span.SetAttributes(attribute.String("langfuse.observation.output", lfJSON(output)))
}

func lfSetMetadata(span trace.Span, metadata map[string]any) {
	attrs := make([]attribute.KeyValue, 0, len(metadata))
	for key, value := range metadata {
		key = "langfuse.observation.metadata." + key
		switch v := value.(type) {
		case string:
			attrs = append(attrs, attribute.String(key, v))
		case bool:
			attrs = append(attrs, attribute.Bool(key, v))
		case int:
			attrs = append(attrs, attribute.Int(key, v))
		default:
			attrs = append(attrs, attribute.String(key, lfJSON(v)))
		}
	}
	span.SetAttributes(attrs...)
}

func lfSetLevel(span trace.Span, level, statusMessage string) {
	span.SetAttributes(attribute.String("langfuse.observation.level", level))
	if statusMessage != "" {
		span.SetAttributes(attribute.String("langfuse.observation.status_message", statusMessage))
	}
	if level == lfLevelError {
		span.SetStatus(codes.Error, statusMessage)
	}
}

func lfJSON(value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}

// ---- AI helpers ----

// startAITrace opens the root span of an AI entry point. When ctx is already in a trace it adds a child
// span instead. end records err as ERROR and closes the span.
func startAITrace(ctx context.Context, name, userID string, metadata map[string]any) (context.Context, trace.Span, func(err error)) {
	if _, ok := ctx.Value(lfTraceKey{}).(lfTraceAttributes); !ok {
		ctx = context.WithValue(ctx, lfTraceKey{}, lfTraceAttributes{name: name, userID: userID})
	}
	ctx, span := lfStart(ctx, name, lfSpan)
	if len(metadata) > 0 {
		lfSetMetadata(span, metadata)
	}
	return ctx, span, func(err error) {
		if err != nil {
			lfSetLevel(span, lfLevelError, truncate(err.Error(), 300))
		}
		span.End()
	}
}

// startAIAttempt wraps one model's turn in runWithFallback. A failure is a WARNING: the next model may
// still answer, and the root span records the final outcome.
func startAIAttempt(ctx context.Context, a aiAttempt, attempt int) (context.Context, func(err error)) {
	ctx, span := lfStart(ctx, "attempt "+a.String(), lfSpan)
	lfSetMetadata(span, map[string]any{"provider": a.Provider.Name, "model": a.Model, "attempt": attempt})
	return ctx, func(err error) {
		if err != nil {
			lfSetLevel(span, lfLevelWarning, truncate(err.Error(), 300))
		}
		span.End()
	}
}

// aiGeneration is one Chat Completions call, so Langfuse shows the model that answered and prices each
// round separately.
type aiGeneration struct {
	span      trace.Span
	model     string
	startedAt time.Time
}

func startAIGeneration(ctx context.Context, a aiAttempt, round int, req chatRequest) aiGeneration {
	_, span := lfStart(ctx, a.Provider.Name+"-assistant", lfGeneration)
	input := map[string]any{"messages": len(req.Messages), "tools": len(req.Tools)}
	if req.ToolChoice != "" {
		input["tool_choice"] = req.ToolChoice
	}
	lfSetInput(span, input)
	lfSetMetadata(span, map[string]any{"provider": a.Provider.Name, "model": a.Model, "round": round})
	return aiGeneration{span: span, model: a.Model, startedAt: time.Now()}
}

func (g aiGeneration) end(res *chatResponse, err error) {
	output := map[string]any{"success": err == nil, "latency_ms": time.Since(g.startedAt).Milliseconds()}
	g.span.SetAttributes(attribute.String("langfuse.observation.model.name", g.model))
	if res != nil {
		if len(res.Choices) > 0 {
			output["finish_reason"] = res.Choices[0].FinishReason
			output["tool_calls"] = len(res.Choices[0].Message.ToolCalls)
		}
		total := res.Usage.TotalTokens
		if total == 0 {
			total = res.Usage.PromptTokens + res.Usage.CompletionTokens
		}
		g.span.SetAttributes(attribute.String("langfuse.observation.usage_details", lfJSON(map[string]int{
			"input":  res.Usage.PromptTokens,
			"output": res.Usage.CompletionTokens,
			"total":  total,
		})))
	}
	if err != nil {
		output["error"] = truncate(err.Error(), 300)
		lfSetLevel(g.span, lfLevelWarning, truncate(err.Error(), 300))
	}
	lfSetOutput(g.span, output)
	g.span.End()
}

// startAITool records that a tool ran; its arguments and result hold family data and are left out.
func startAITool(ctx context.Context, name string) func() {
	_, span := lfStart(ctx, name, lfTool)
	return func() { span.End() }
}
