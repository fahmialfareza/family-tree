# AI Workflow Templates

These templates are shared prompt starters for GitHub Copilot, Codex, and Claude Code.

Use them as plain markdown: copy the template into your assistant chat, replace the placeholders, and keep the request anchored to a file, symbol, endpoint, or failing behavior.

## Templates

- `implement-feature.md`: for new endpoints, UI work, or scoped feature delivery.
- `fix-bug.md`: for regressions, failing behavior, or debugging work.
- `review-change.md`: for code review, pull request review, or risk analysis.

## Repo-Specific Templates

- `add-backend-go-api-endpoint.md`: for controller and route work under `apps/backend-go/internal/`.
- `add-frontend-page-service-store.md`: for frontend flows that span `src/app/`, `src/service/`, and `src/zustand/`.
- `port-legacy-backend-endpoint-to-go.md`: for migrating endpoint behavior from `apps/backend/src/` into `apps/backend-go/internal/`.
- `review-legacy-vs-go-api-parity.md`: for parity reviews between `apps/backend/src/` and `apps/backend-go/internal/`.

## Usage Notes

- Start with a concrete anchor such as a file path, symbol name, route, or error message.
- Name the target app explicitly: `apps/backend-go`, `apps/frontend`, or `apps/backend`.
- Ask for the narrowest relevant validation command.
- If the task comes from `.github/tasks/`, ask the assistant to keep the checklist updated.
- Prefer the active apps unless you specifically need legacy backend work.
- When a request already maps to one of the repo-specific templates, start there before falling back to the generic templates.

## Common Validation Hints

- Go backend: `cd apps/backend-go && go build ./...`
- Frontend: `pnpm --filter frontend lint` or `pnpm --filter frontend build`
- Legacy backend: `pnpm --filter backend lint` or `pnpm --filter backend typecheck`
