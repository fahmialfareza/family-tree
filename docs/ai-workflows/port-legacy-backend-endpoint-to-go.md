# Port Legacy Backend Endpoint To Go Template

Use this template when you want an assistant to migrate or mirror endpoint behavior from `apps/backend` into `apps/backend-go`.

```text
You are working in the Family Tree monorepo.

Before editing:
- Read AGENT_CONTEXT.md.
- Read .github/instructions/backend.instructions.md and .github/instructions/backend-go.instructions.md.
- If this work comes from a task spec under .github/tasks/, update its checklist as items are completed.

Task
Port a legacy Express endpoint from apps/backend to apps/backend-go.

Source and Target
- Legacy route file: <apps/backend/src/routes/...>
- Legacy controller file: <apps/backend/src/controllers/...>
- Go target anchor: <apps/backend-go/internal/routes.go | specific *_controller.go | store.go | models.go>
- Endpoint method and path: <GET|POST|PUT|DELETE ...>
- Required request shape: <params, query, body>
- Required response shape: <success body, error body>

Compatibility Expectations
- Preserve request and response behavior unless the task explicitly changes it.
- Match status codes, validation behavior, and field names where practical.
- Keep the Go handler thin and move reusable logic into the existing `internal/` packages.
- Reuse or adapt the existing Go controller, route, model, and store patterns instead of creating a parallel structure.
- If the Go backend already has a related endpoint, update the existing flow instead of duplicating it.

Validation
- Run `cd apps/backend-go && go build ./...`.
- If useful for comparison, also inspect the legacy backend behavior without changing it.
- Include manual verification steps showing how to compare legacy and Go responses.

Deliverables
- Implement the Go endpoint or behavior change.
- Summarize the legacy source files and the Go target files.
- Call out any compatibility gaps, assumptions, or deliberate deviations.
```
