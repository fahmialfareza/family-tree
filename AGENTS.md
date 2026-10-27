# Family Tree Agent Instructions

This file is the entrypoint for Codex and other OpenAI agents working in this repository.

## Start Here

- Read `AGENT_CONTEXT.md` first. It is the shared source of truth for repository facts, workflow rules, and validation guidance.
- Apply any matching file-scoped guidance from `.github/instructions/*.instructions.md` when editing code under `apps/frontend` or `apps/backend-go`.
- Reusable prompt starters live in `docs/ai-workflows/`.
- Keep this file aligned with `AGENT_CONTEXT.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` when shared guidance changes.

## Quick Repo Summary

- Active backend: `apps/backend-go`
- Active frontend: `apps/frontend`
- Desktop and mobile apps: `apps/native` (Tauri 2 shell that shows the hosted frontend; see its README)
- JavaScript and TypeScript work should use `pnpm` from the repo root.
- Go backend work should follow existing `internal/` package patterns and stay `gofmt` compatible.
- `apps/backend-go` has database-backed authorization tests (`go test ./...` with `TEST_DATABASE_URL`, optionally `TEST_REDIS_URL`; they skip when unset). Elsewhere there is no automated test suite, so use targeted lint, build, or type-check commands and provide manual verification when needed.

## Working Expectations

- Prefer small, targeted changes over broad rewrites.
- Reuse existing patterns before adding new abstractions.
- Do not introduce secrets or large new dependencies without clear justification.
- Follow Conventional Commits and mention the affected app plus verification steps in change summaries.
