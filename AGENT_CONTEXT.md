# Family Tree Agent Context

This file is the shared project guide for GitHub Copilot, Codex, and Claude Code. Tool-specific instruction files should add only tool-specific behavior and defer shared repository facts to this document.

## Project Summary

- Family Tree is a monorepo for frontend and backend services. The product is branded **Sakdulur** (sakdulur.com); keep user-facing names in `apps/frontend/src/lib/brand.ts` and the `meta.brand` messages, while internal identifiers (package names, cache keys, app ids, Cloudinary folders) stay `family-tree`.
- Active apps:
  - `apps/backend-go`: primary backend service written in Go with Gin. Most backend changes should happen here. Reuse existing code under `internal/`.
  - `apps/frontend`: primary frontend app built with Next.js 16, React 19, and `pnpm`.
  - `apps/native`: macOS/Windows/Linux/iOS/Android apps (Tauri 2). A Vite SPA that bundles `apps/frontend/src`'s components (imported as `@/…`, with `next/*` and `next-intl` shimmed) and calls the Go API directly with bearer tokens; `src/native/*` replaces the frontend's `lib/api/client.ts`, `lib/native.ts` and `lib/offline.ts`, so keep their exports in step. A frontend component change can break the app: run `pnpm --filter native check-types` and `build` too. Native work is in Rust (`src-tauri/src/lib.rs`). Store releases: `apps/native/RELEASE.md`.
  - Sentry: `apps/frontend` (`instrumentation*.ts`, `worker.ts`, `src/lib/sentry.ts`) and `apps/native` (`src/sentry.ts`); off without a DSN. Family data is private: keep `dataCollection` strict and replays masked.

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
- Schema changes go in a new numbered SQL migration under `apps/backend-go/internal/migrations/`; never edit an applied one.

### Frontend (`apps/frontend`)

- Follow the existing Next.js App Router structure (`src/app/[locale]/` with `(marketing)`, `(auth)`, `(app)` route groups; locale-free URLs via middleware rewrite) and component patterns; see `apps/frontend/README.md`.
- The browser never calls the Go API directly: use the TanStack Query hooks in `src/lib/api/hooks.ts`, which go through the `/api/proxy` BFF route; sessions live in httpOnly cookies.
- Every UI string goes in both `messages/en.json` and `messages/id.json`; use the design tokens in `src/app/globals.css`.
- Use `pnpm` for dependencies and scripts.
- Respect the current TypeScript and lint configuration instead of introducing alternative tooling.
- Validate with the narrowest relevant `pnpm` script, usually lint, type-check, or build for the affected surface.

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
- `apps/backend-go` has database-backed authorization tests (`go test ./...` with `TEST_DATABASE_URL`, optionally `TEST_REDIS_URL`; they skip when unset). Elsewhere there is no automated test suite. Prefer focused lint, build, or type-check commands and include manual verification steps when automation is not available. Extend the authorization tests in `apps/backend-go/internal/authz_test.go` when adding or changing tree-scoped routes.

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

## Agent Skills

- Shared agent skills live in `.agents/skills/` (used by Codex) and are symlinked into `.claude/skills/` for Claude Code. `skills-lock.json` pins each skill's source and hash.
- Installed: `cloudflare`, `karpathy-guidelines`, `nextjs-on-cloudflare`, `security-audit`, `use-railway`, `vercel-react-best-practices`, `web-perf`, `workers-best-practices`, `wrangler`, and `graphify`.
- Restore after clone: `npx skills experimental_install`. Update: `npx skills update -p`. Add: `npx skills add <owner/repo> --skill <name> -a claude-code -a codex`.
- `graphify` is managed by its own installer, not `skills-lock.json`: install the CLI with `uv tool install graphifyy`, then refresh the skill with `graphify install --project --platform agents`.
