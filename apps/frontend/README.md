# Family Tree — frontend

Next.js 16 (App Router) + React 19, Tailwind CSS 4 with shadcn/ui, TanStack Query, React Flow + ELK for the tree
canvas, next-intl (English / Bahasa Indonesia), next-themes (light / dark). Deployed to Cloudflare Workers with
OpenNext.

## Run

```bash
cp .env.example .env          # optional in development: localhost defaults are built in
pnpm --filter frontend dev    # http://localhost:3000 (the Go API must run on :4000)
pnpm --filter frontend lint
pnpm --filter frontend check-types
pnpm --filter frontend build
```

## How it talks to the API (BFF)

The browser only talks to this app. Tokens never reach page JavaScript:

- `src/app/api/session/*` — login, signup, email verification, logout, Google start. Successful sign-ins store the
  access token (`ft_access`, ~15 min) and refresh token (`ft_refresh`, 30 days) in httpOnly, SameSite=Lax cookies.
- `src/app/auth/google/complete` (in the `(auth)` group) — exchanges Google's one-time code together with the
  browser-bound `ft_oauth_binding` cookie.
- `src/app/api/proxy/[...path]` — forwards `/api/proxy/api/...` to the Go API with the bearer token, refreshes the
  session once on 401, and rejects cross-site state-changing requests.
- `src/middleware.ts` — language: public pages have language URLs (`/en`, `/id/privacy`) served as is; other
  URLs pick the language (`NEXT_LOCALE` cookie, country, `Accept-Language`; see `src/i18n/config.ts`) and are
  rewritten to `/{locale}/path`. Also guards `/app/**` and refreshes an expired access token before server
  components render.
- `src/lib/api/hooks.ts` — TanStack Query hooks; query keys are scoped per tree.

## Layout

- `src/app/[locale]/` holds every page (app URLs are locale-free, see middleware). `(marketing)` — landing, privacy, terms
  (also at `/en/...` and `/id/...`; build their links with `localePath` from `src/lib/seo.ts`),
  prerendered per language and served from Workers static assets (`open-next.config.ts`); the header reads the
  `ft_signed_in` hint cookie in the browser. `(auth)` — sign-in flows and `/invite`.
  `(app)/app` — the signed-in app: `/app/t/[treeId]` (canvas), `people`, `families`, `members`, `settings`,
  plus `/app/account` and `/app/onboarding`.
- `src/components/tree-canvas` — React Flow canvas; `layout.ts` turns the API graph into an ELK layered layout
  (couples feed a small union node, children hang below it).
- `src/components/person` — drawer, form (partial dates), quick-add, relatives and sharing panels.
- `messages/en.json`, `messages/id.json` — every UI string; keep both files in sync.
- Design tokens live in `src/app/globals.css` (oklch variables for light and dark).

## Environment

See `.env.example`. Production needs `BACKEND_URL` and `NEXT_PUBLIC_APP_URL` (https). The full list for both apps
is in `docs/production-setup.md`.
