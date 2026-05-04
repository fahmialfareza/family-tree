# Add Backend Go API Endpoint Template

Use this template when you want an assistant to add or port an endpoint in `apps/backend-go`.

```text
You are working in the Family Tree monorepo.

Before editing:
- Read AGENT_CONTEXT.md.
- Read .github/instructions/backend-go.instructions.md.
- If this work comes from a task spec under .github/tasks/, update its checklist as items are completed.

Task
Add or update a Go API endpoint in apps/backend-go.

Endpoint Details
- Route or feature name: <name>
- HTTP method and path: <GET|POST|PUT|DELETE ...>
- Main anchor: <internal/routes.go | specific *_controller.go | store.go | models.go>
- Request shape: <payload, params, query>
- Response shape: <success body, error body>
- Auth or middleware needs: <none | JWT | rate limit | upload | other>

Implementation Expectations
- Keep handlers thin and follow the existing `internal/*_controller.go` patterns.
- Reuse the current `internal/` packages before adding new helpers.
- If this endpoint mirrors legacy behavior from `apps/backend`, preserve request and response compatibility unless the task says otherwise.
- Update routing, controller logic, and shared model or store logic only where needed.
- Do not introduce a parallel package structure.

Validation
- Run `cd apps/backend-go && go build ./...`.
- If behavior needs manual verification, describe the request you would send and the expected response.

Deliverables
- Implement the endpoint.
- Summarize the touched files and the request flow.
- Call out any assumptions about payload shape, auth, or compatibility.
```
