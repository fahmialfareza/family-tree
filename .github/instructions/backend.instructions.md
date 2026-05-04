---
name: "Legacy Backend Coding Conventions"
description: "Coding conventions for the legacy Express backend app"
applyTo: "apps/backend/**/*.ts"
---

# [Deprecated] Copilot Instructions — apps/backend

## Purpose

Guidance for working in the legacy Express backend app.

## Key points

- This app is maintenance-only. Avoid adding new features here unless the task explicitly targets the legacy backend.
- Language: TypeScript. Follow the existing Express, DTO, repository, and service patterns.

## Run & test

- Dev: `pnpm --filter backend dev`
- Lint: `pnpm --filter backend lint`
- Type-check: `pnpm --filter backend typecheck`

## Style & safety

- Keep changes localized.
- Reuse the existing controller, service, and repository structure.
- Preserve API behavior unless the task explicitly changes it.

## Examples of good prompts

- "Add a route that fetches data from the database; include error handling."
