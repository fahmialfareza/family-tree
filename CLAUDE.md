# Family Tree Claude Code Instructions

This file is the entrypoint for Claude Code when working in this repository.

## Start Here

- Read `AGENT_CONTEXT.md` first. It contains the shared repository facts and workflow rules that should stay aligned across Claude Code, Codex, and GitHub Copilot.
- Apply matching file-scoped guidance from `.github/instructions/*.instructions.md` when you edit code in `apps/frontend`, `apps/backend-go`, or `apps/backend`.
- Reusable prompt starters live in `docs/ai-workflows/`.
- Treat `.claude/settings.local.json` as developer-local configuration, not as shared project policy.
- Keep this file aligned with `AGENT_CONTEXT.md`, `AGENTS.md`, and `.github/copilot-instructions.md` when shared guidance changes.

## Quick Repo Summary

- Active backend: `apps/backend-go`
- Active frontend: `apps/frontend`
- Deprecated backend: `apps/backend`
- Use `pnpm` for JavaScript and TypeScript workflows.
- Reuse existing Go code under `apps/backend-go/internal/` instead of introducing parallel packages.
- There is no established automated test suite, so prefer focused lint, build, or type-check commands and include manual verification when needed.

## Working Expectations

- Prefer minimal, local changes.
- Match existing project structure before creating new helpers, services, or layers.
- Do not add secrets, credentials, or unnecessary third-party services.
- Avoid new feature work in `apps/backend` unless the task explicitly targets the legacy backend.
- Follow Conventional Commits and mention the affected app plus verification steps in change summaries.
