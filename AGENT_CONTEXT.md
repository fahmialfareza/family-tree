# Family Tree Agent Context

This file is the shared project guide for GitHub Copilot, Codex, and Claude Code. Tool-specific instruction files should add only tool-specific behavior and defer shared repository facts to this document.

## Project Summary

- Family Tree is a monorepo for frontend and backend services.
- Active apps:
  - `apps/backend-go`: primary backend service written in Go with Gin. Most backend changes should happen here. Reuse existing code under `internal/`.
  - `apps/frontend`: primary frontend app built with Next.js 16, React 19, and `pnpm`.
- Maintenance-only app:
  - `apps/backend`: older Express server that is being phased out. Avoid adding new features there unless the user explicitly asks for legacy backend work.

## Working Rules

- Prefer minimal, focused changes over broad rewrites.
- Match existing directory structure and project patterns before introducing new abstractions.
- Never add secrets, tokens, or credentials to the repository. If a change needs configuration, document the required environment variables instead.
- Use sanitized logging and error messages; do not leak sensitive data.
- Avoid heavy new dependencies or external services unless the user asks for them or the tradeoffs are called out clearly.
- When requirements are ambiguous, choose the smallest reasonable change and state the assumption.

## Language and Package Guidance

### Go backend (`apps/backend-go`)

- Keep code idiomatic and compatible with `gofmt`.
- Prefer context-aware operations where the surrounding code uses them.
- Reuse existing `internal/` packages and controller or store patterns instead of creating parallel layers.
- Validate Go changes with the narrowest useful command, usually from `apps/backend-go` with `go build ./...`.

### Frontend (`apps/frontend`)

- Follow the existing Next.js App Router structure, component patterns, and Zustand organization.
- Use `pnpm` for dependencies and scripts.
- Respect the current TypeScript and lint configuration instead of introducing alternative tooling.
- Validate with the narrowest relevant `pnpm` script, usually lint, type-check, or build for the affected surface.

### Legacy backend (`apps/backend`)

- Treat this app as maintenance-only.
- Keep any changes localized and compatible with the current Express and TypeScript setup.
- Prefer `pnpm --filter backend lint` or `pnpm --filter backend typecheck` for validation when this app is touched.

## Tooling and Commands

- Package manager: `pnpm`
- Monorepo task runner: `turbo`
- Recommended runtime from the root Volta config: Node `24.11.0` and `pnpm` `10.20.0`
- Root scripts:
  - `pnpm build`
  - `pnpm dev`
  - `pnpm lint`
  - `pnpm check-types`
  - `pnpm format`
- Frontend scripts live in `apps/frontend/package.json`.
- Legacy backend scripts live in `apps/backend/package.json`.
- There is no established automated test suite in this repository today. Prefer focused lint, build, or type-check commands and include manual verification steps when automation is not available.

## Commit and PR Guidance

- Follow Conventional Commits: `type(scope): subject`
- The commit-message reference lives in `.github/skills/commit-standards.skill.md`.
- In PR descriptions or change summaries, mention the affected app or apps and the manual verification steps.

## Agent Maintenance

- Keep `AGENT_CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` aligned when shared guidance changes.
- Shared reusable workflow templates live in `docs/ai-workflows/`.
- When file-scoped coding rules apply, consult `.github/instructions/*.instructions.md`.
- When working from task specs, keep checklist status updated in:
  - `.github/tasks/features/*.feature.md`
  - `.github/tasks/fixes/*.fix.md`
  - `.github/tasks/chores/*.chore.md`
