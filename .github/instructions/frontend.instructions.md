---
name: "Frontend App Coding Conventions"
description: "Coding conventions for the Next.js frontend app in the `apps/frontend` directory."
applyTo: "apps/frontend/**/*.ts, apps/frontend/**/*.js, apps/frontend/**/*.tsx, apps/frontend/**/*.jsx"
---

# Copilot Instructions — apps/frontend

## Purpose

Guidance for working in the Next.js frontend app.

## Key points

- Language: TypeScript/JavaScript with Next.js. Follow `tsconfig.json` and existing component patterns.
- Structure:
  - `.vscode/` for editor settings and launch configurations.
  - `public/` for static assets.
  - `src/` for application code, organized into:
    - `app/` for Next.js app directory structure (if using Next.js 13+).
    - `components/` for reusable components.
    - `lib/` for utility functions and hooks.
    - `models/` for TypeScript types and interfaces.
    - `service/` for API calls and business logic.
    - `zustand/` for state management using Zustand (if applicable).
  - `components.json` for component metadata (if applicable).
  - `eslint.config.mjs` for linting rules.
  - `next.config.ts` for Next.js configuration.
  - `open-next.config.ts` for OpenNext configuration (if applicable).
  - `package.json` for dependencies and scripts.
  - `postcss.config.mjs` for PostCSS configuration (if using Tailwind CSS or similar).
  - `Readme.md` for documentation specific to the frontend app.
  - `tsconfig.json` for TypeScript configuration.
  - `wrangler.jsonc` for Cloudflare Workers configuration (if applicable).

## Run & test

- Dev: `pnpm --filter frontend install && pnpm --filter frontend dev` (or `next dev` in `apps/frontend`).
- Build: `pnpm --filter frontend install && pnpm --filter frontend build` (or `next build` in `apps/frontend`).

## Style & safety

- Follow existing code patterns and conventions in the `apps/frontend` directory.
- Use TypeScript for type safety and maintainability.
- Write clear, concise code with meaningful variable and function names.
- Add comments where necessary to explain complex logic or decisions.
- Ensure new components are reusable and follow the design system (if applicable).

## Examples of good prompts

- "Add a new screen and navigation entry; wire state using existing `zustand` store."
- "Create a small hook in `service/` to wrap local storage usage and add tests."
