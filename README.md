# Family Tree

Family Tree is a monorepo for the active Go backend and Next.js frontend used by this project.

## Apps

- `apps/backend-go`: primary backend service written in Go with Gin.
- `apps/frontend`: primary frontend app built with Next.js 16, React 19, and `pnpm`.
- `apps/backend`: legacy Express backend kept for maintenance-only work.

## Prerequisites

- Node `24.11.0`
- `pnpm` `10.20.0`
- Go for `apps/backend-go`

The repository declares the recommended Node and `pnpm` versions in the root `package.json` Volta config.

## Common Commands

Run these from the repository root unless noted otherwise.

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm check-types
pnpm format
```

For the Go backend, use the app directory directly:

```bash
cd apps/backend-go
go run ./main.go
go build ./...
```

## AI Assistant Files

This repository now has a shared instruction layout so GitHub Copilot, Codex, and Claude Code follow the same project guidance.

- `AGENT_CONTEXT.md`: shared repository context for all assistants.
- `AGENTS.md`: root entrypoint for Codex and other OpenAI agents.
- `CLAUDE.md`: root entrypoint for Claude Code.
- `.github/copilot-instructions.md`: GitHub Copilot-specific behavior layered on top of the shared context.
- `.github/instructions/*.instructions.md`: file-scoped coding conventions for specific parts of the repo.
- `docs/ai-workflows/`: shared prompt and workflow templates you can paste into any of the three assistants.

If you update shared project guidance, keep those files aligned.

## Verification Notes

There is no established automated test suite in this repository today. Prefer focused lint, build, and type-check commands, and include manual verification steps when making changes.
