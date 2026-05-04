# GitHub Copilot Instructions — Family Tree

## Purpose

This file contains GitHub Copilot-specific guidance for working inside this repository. Shared repository facts that should stay aligned across Copilot, Codex, and Claude Code live in `AGENT_CONTEXT.md`.

## Start Here

- Read `AGENT_CONTEXT.md` before making changes.
- Apply matching file-scoped conventions from `.github/instructions/*.instructions.md` when editing code under `apps/frontend`, `apps/backend-go`, or `apps/backend`.
- Reusable prompt starters live in `docs/ai-workflows/`.
- Keep `AGENT_CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, and this file aligned when shared guidance changes.

## Copilot Specific Notes

- Copilot runs inside VS Code and should cooperate with the repository hooks in `.github/hooks/`.
- Post-edit formatting currently runs automatically:
  - Go files in `apps/backend-go` via `gofmt`
  - TypeScript and JavaScript files in `apps/frontend` via `prettier`
- When a change affects CI, build scripts, or developer workflows, include the necessary script or config updates and explain the verification steps.

## Repo Specific Reminders

- `apps/backend-go` and `apps/frontend` are the active apps.
- `apps/backend` is a deprecated Express service; avoid new feature work there unless explicitly requested.
- Use `pnpm` for JavaScript and TypeScript dependency changes.
- There is no established automated test suite in this repository; prefer targeted lint, build, or type-check commands and include manual verification steps.
- Use Conventional Commits; see `.github/skills/commit-standards.skill.md`.

## Git Hooks

- Pre-commit: runs lint-staged (auto-formats Go, TypeScript, and other files)
- Commit-msg: validates commit message format using commitlint

## Copilot Hooks

- Post-edit formatting: automatically formats files after Copilot edits them
  - Go files in `apps/backend-go`: formatted with `gofmt`
  - TypeScript/JavaScript files in `apps/frontend`: formatted with `prettier`
- See `.github/hooks/README.md` for details

— End of instructions —

## Task Specifications

- When implementing features in `.github/tasks/features/*.feature.md`, keep checklist state updated.
- When fixing bugs in `.github/tasks/fixes/*.fix.md`, keep checklist state updated.
- When performing chores in `.github/tasks/chores/*.chore.md`, keep checklist state updated.
