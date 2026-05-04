---
name: "Server App Coding Conventions"
description: "Coding conventions for the Express.js server app"
applyTo: "apps/server/**/*.ts"
---

# [Deprecated] Copilot Instructions — apps/server

## Purpose

Guidance for working in the Express.js server app.

## Key points

- Language: TypeScript. Follow `tsconfig.json`, and existing component patterns.

## Run & test

- Install & dev: `pnpm --filter server install && pnpm --filter server dev`.
- Lint/format: use repo ESLint/config rules present in the project.

## Style & safety

- Keep accessibility and responsiveness in mind.

## Examples of good prompts

- "Add a route that fetches data from the database; include error handling."
