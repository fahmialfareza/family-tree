# Review Legacy Vs Go API Parity Template

Use this template when you want an assistant to compare legacy Express API behavior in `apps/backend` against the Go backend in `apps/backend-go`.

```text
Review API parity between the legacy backend and the Go backend in the Family Tree monorepo.

Before reviewing:
- Read AGENT_CONTEXT.md.
- Read .github/instructions/backend.instructions.md and .github/instructions/backend-go.instructions.md.

Comparison Target
- Legacy route file: <apps/backend/src/routes/...>
- Legacy controller or service file: <apps/backend/src/controllers/... or services/...>
- Go route or controller file: <apps/backend-go/internal/routes.go or specific *_controller.go>
- Endpoint method and path: <GET|POST|PUT|DELETE ...>
- Focus area: <response shape | status codes | validation | auth | field naming | pagination | upload behavior | mixed>

Review Rules
- Prioritize behavioral mismatches that could break clients.
- Compare request validation, status codes, response fields, nullability, and error handling.
- Call out auth, middleware, upload, and rate-limit differences when they affect behavior.
- Distinguish clearly between confirmed mismatches and assumptions caused by missing context.
- Keep findings ordered by severity.

Output Format
- Findings first with concrete file references.
- Then known compatibility gaps or open questions.
- Then a short parity summary: <fully aligned | mostly aligned with gaps | not aligned>.
```
