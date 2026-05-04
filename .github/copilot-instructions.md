# GitHub Copilot Instructions — Family Tree

## Purpose

This file tells GitHub Copilot how to behave when working inside this repository. Use it to produce code, tests, documentation, and CI changes that match the project's architecture, languages, and conventions.

Shared repository facts that should stay aligned across Copilot, Codex, and Claude Code now live in `AGENT_CONTEXT.md`. Keep that file in sync when updating assistant guidance.

## Project summary

- Monorepo for `Family Tree` (frontend + backend services).
- Key apps:
  - `apps/backend-go`
    The backend Go server with Gin Gonic framework.
  - `apps/frontend`
    Family Tree frontend Next.js app. Uses pnpm and has a `package.json` with scripts and dependencies.
  - (deprecated) `apps/backend`
    An older Node.js Express server that is being phased out. Avoid adding new code here.

## Primary goals for Copilot

- Respect the language and framework used by each package (Go for backend, TypeScript/Next.js for frontend).
- Prefer minimal, focused changes to existing files rather than large rewrites.
- Follow existing project patterns and directory conventions.
- Never introduce secrets, API keys, or credentials. If a change requires secrets, add a note listing required env vars instead of embedding them.

## Code style & quality

For detailed code standards, see `.github/skills/code-standards.skill.md`.

**Quick Reference:**

- For Go: follow `gofmt` formatting, idiomatic Go error handling, context-aware functions, and package visibility rules. Use existing packages under `pkg/` instead of creating duplicates.
- For TypeScript/Next.js: follow existing tsconfig, lint rules, and component patterns. Use `pnpm` and existing scripts in `package.json` for adding dependencies.
- Tests: don't add unit tests since we don't have a test framework set up.

**Git Hooks:**

- Pre-commit: runs lint-staged (auto-formats Go, TypeScript, and other files)
- Commit-msg: validates commit message format using commitlint

**Copilot Hooks:**

- Post-edit formatting: automatically formats files after Copilot edits them
  - Go files in `apps/backend-go`: formatted with `gofmt`
  - TypeScript/JavaScript files in `apps/frontend`: formatted with `prettier`
- See `.github/hooks/README.md` for details

## When editing files

- Add new helper functions or modules in the correct package folder.
- Update import paths to match the monorepo config; prefer local `package/` modules where already present.
- Keep changes well-scoped and add comments explaining non-obvious logic.

## Commit & CI guidance

- Follow Conventional Commits specification (see `.github/skills/commit-standards.skill.md`).
- Format: `type(scope): subject` - e.g., `feat(mobile): add spending threshold`, `fix(backend): correct timezone handling`.
- Common types: feat, fix, chore, docs, refactor, style, perf, test, build, ci, revert.
- If a change affects CI, tests, or build scripts, include the necessary updates to `package.json` and explain required CI steps.

## Security & secrets

- When suggesting code that could leak data (logging, error messages), use sanitized logging and avoid printing sensitive fields.

## Helpful run/test commands

**From root directory:**

- Backend: `pnpm run dev:backend`
- Frontend: `pnpm run dev:frontend`
- Server (deprecated): `pnpm run dev:server`
- Format all: `pnpm run format:all` (TypeScript + Go)

**Backend (Go):** Use VS Code debugger if configured.

## Examples of good prompts for Copilot in this repo

- "Add a API in `apps/backend-go` that uses the internal `pkg` layer to get data from database; include error handling."
- "Refactor Next.js component A to extract a reusable store under `frontend/zustand` and update callers. Keep UI behavior unchanged and add a small test."

## Do not

- Do not add heavy new third-party services without noting tradeoffs and adding them to top-level `package.json` or `go.mod` appropriately.

## If unsure

- When a design decision is ambiguous, prefer small incremental changes and include a comment describing assumptions. Create a short PR description listing alternatives.

## Contact points (for humans)

- Mention in PR description the affected app (e.g., `apps/backend-go`, `apps/backend`, `apps/frontend`) and list manual verification steps.

## Maintenance notes for Copilot

- When generating code, include tests and basic documentation for any new public API.
- Keep changes consistent with monorepo tooling (pnpm, pipenv, go modules).

— End of instructions —

## Task Specifications

- When implementing features in the `.github/tasks/features/*.feature.md` files, follow the existing structure and conventions and check off the features as they are completed.
- When fixing bugs in the `.github/tasks/fixes/*.fix.md` files, follow the existing structure and conventions and check off the fixes as they are completed.
- When performing chores, create task specifications in `.github/tasks/chores/` following the same pattern.
