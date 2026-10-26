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
- Structure (see `apps/frontend/README.md`):
  - Pages live under `src/app/[locale]/` (`(marketing)`, `(auth)`, `(app)/app` route groups). URLs carry no
    locale: `src/middleware.ts` picks it and rewrites into `[locale]`. Pages that should stay prerendered (the
    marketing site) call `pageLocale()` from `src/i18n/static.ts` and must not read cookies or headers.
  - `src/app/api/session/*` and
    `src/app/api/proxy/[...path]` are the BFF: the browser never calls the Go API or sees tokens.
  - `src/components/ui/` shadcn/ui primitives (generate new ones with the shadcn CLI); feature components under
    `src/components/<feature>/`.
  - `src/lib/api/` types, fetch client and TanStack Query hooks; `src/lib/server/` server-only helpers.
  - `messages/en.json` and `messages/id.json` hold every UI string; add new keys to both.
  - Design tokens are CSS variables in `src/app/globals.css`; use semantic Tailwind classes (`bg-card`,
    `text-muted-foreground`, `bg-primary`), not raw colors.
- Data fetching: use the hooks in `src/lib/api/hooks.ts`; invalidate with the per-tree keys after mutations.
- Accessibility: label every control (the `Field` helper wires `aria-describedby`/`aria-invalid`), keep visible focus
  states, and use Radix-based dialogs/sheets so focus trapping and Esc work.

## Run & test

- Dev: `pnpm --filter frontend install && pnpm --filter frontend dev` (or `next dev` in `apps/frontend`).
- Build: `pnpm --filter frontend install && pnpm --filter frontend build` (or `next build` in `apps/frontend`).
- Lint / types: `pnpm --filter frontend lint` and `pnpm --filter frontend check-types`.

## Style & safety

- Follow existing code patterns and conventions in the `apps/frontend` directory.
- Use TypeScript for type safety and maintainability.
- Write clear, concise code with meaningful variable and function names.
- Add comments where necessary to explain complex logic or decisions.
- Ensure new components are reusable and follow the design system (if applicable).

## Examples of good prompts

- "Add a new screen and navigation entry; wire state using existing `zustand` store."
- "Create a small hook in `service/` to wrap local storage usage and add tests."
