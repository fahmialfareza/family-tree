# Family Tree Agent Instructions

This file is the entrypoint for Codex and other OpenAI agents working in this repository.

## Start Here

- Read `AGENT_CONTEXT.md` first. It is the shared source of truth for repository facts, workflow rules, and validation guidance.
- Apply any matching file-scoped guidance from `.github/instructions/*.instructions.md` when editing code under `apps/frontend`, `apps/backend-go`, or `apps/backend`.
- Reusable prompt starters live in `docs/ai-workflows/`.
- Keep this file aligned with `AGENT_CONTEXT.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` when shared guidance changes.

## Quick Repo Summary

- Active backend: `apps/backend-go`
- Active frontend: `apps/frontend`
- Deprecated backend: `apps/backend`
- JavaScript and TypeScript work should use `pnpm` from the repo root.
- Go backend work should follow existing `internal/` package patterns and stay `gofmt` compatible.
- There is no established automated test suite, so use targeted lint, build, or type-check commands and provide manual verification when needed.

## Working Expectations

- Prefer small, targeted changes over broad rewrites.
- Reuse existing patterns before adding new abstractions.
- Do not introduce secrets or large new dependencies without clear justification.
- Avoid new feature work in `apps/backend` unless the user explicitly asks for legacy backend changes.
- Follow Conventional Commits and mention the affected app plus verification steps in change summaries.
