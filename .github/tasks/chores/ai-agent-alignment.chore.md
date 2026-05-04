# Chore: Align AI Agent Instructions

## Goal

Create a shared repository guide so GitHub Copilot, Codex, and Claude Code use the same project context.

## Checklist

- [x] Add `AGENT_CONTEXT.md` as the shared source of truth
- [x] Add `AGENTS.md` for Codex and OpenAI agents
- [x] Add `CLAUDE.md` for Claude Code
- [x] Update `.github/copilot-instructions.md` to defer shared repository facts to `AGENT_CONTEXT.md`
- [x] Verify cross-references and command names
- [x] Add shared workflow templates under `docs/ai-workflows/`
- [x] Link workflow templates from the root and agent entrypoints
- [x] Add repo-specific templates for Go API endpoint work
- [x] Add repo-specific templates for frontend page, service, and Zustand flows
- [x] Add a repo-specific template for porting legacy backend endpoints to Go
- [x] Add a repo-specific template for reviewing legacy and Go API parity
