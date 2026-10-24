# Deployment and configuration

Two apps: the Go API (`apps/backend-go`, Railway) and the Next.js frontend (`apps/frontend`, Cloudflare Workers via
OpenNext). Browsers only talk to the frontend; its server forwards API calls (BFF) and keeps the session in httpOnly
cookies.

```
browser ──► frontend (Cloudflare)  ──BACKEND_URL──►  Go API (Railway) ──► Postgres, Redis
               │  X-Client-IP + X-BFF-Secret             │
               └── Google sign-in redirects the browser to BACKEND_PUBLIC_URL/api/auth/google/start
```

## Go API environment (`apps/backend-go`)

| Variable | Required | Production value / notes |
| --- | --- | --- |
| `APP_ENV` | prod | `production` — the server refuses to start if anything below marked "prod" is missing or unsafe; also JSON logs, HSTS, gin release mode |
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | ≥ 32 random characters (`openssl rand -base64 48`). Rotating it signs everyone out |
| `PORT` | no | Set by Railway |
| `APP_BASE_URL` | prod | Frontend origin, `https://…` — used in email links and after Google sign-in |
| `API_BASE_URL` | prod | This API's public origin, `https://…` — Google OAuth callback |
| `ALLOWED_ORIGINS` | prod | Frontend origin(s), comma-separated, no path (e.g. `https://familytree.example`) |
| `BFF_SHARED_SECRET` | prod | ≥ 32 random characters, **same value as the frontend's** |
| `TRUSTED_PROXIES` / `CLIENT_IP_HEADER` | prod (one) | For requests that do not come through the frontend. If unsure on Railway use `TRUSTED_PROXIES=none` |
| `REDIS_URL` | prod | Rate limits and caching are off without it |
| `RESEND_API_KEY` | prod | Transactional email (verification, reset, invites) |
| `EMAIL_FROM` | recommended | e.g. `Family Tree <noreply@your-domain>` on a domain verified in Resend |
| `CLOUDINARY_URL` | for photos | `cloudinary://key:secret@cloud`; without it production rejects photo uploads |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | Enables "Continue with Google". Authorized redirect URI: `${API_BASE_URL}/api/auth/google/callback` |
| `NEW_RELIC_ENABLED`, `NEW_RELIC_APP_NAME`, `NEW_RELIC_LICENSE_KEY` | optional | APM / error tracking |
| `DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS` | optional | Pool size (defaults 20 / 10) |
| `TREE_DEBUG` | no | `1` for debug logs on tree endpoints |
| `UPLOAD_DIR` | dev only | Local photo storage when Cloudinary is not set (served at `/uploads`) |

## Frontend environment (`apps/frontend`)

`NEXT_PUBLIC_*` values are inlined at **build** time, so set them where `pnpm deploy` runs (CI or your machine).
The others are read at runtime: set them in the Worker (`wrangler secret put` for secrets).

| Variable | Where | Notes |
| --- | --- | --- |
| `BACKEND_URL` | runtime (required) | Go API URL reachable from the Worker, e.g. `https://api.familytree.example` |
| `BACKEND_PUBLIC_URL` | runtime | Go API URL for browsers (Google sign-in); defaults to `BACKEND_URL` |
| `BFF_SHARED_SECRET` | runtime secret | Same value as the API's |
| `NEXT_PUBLIC_APP_URL` | build (required) | This site's origin, `https://…` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | build | Footer and legal pages |
| `NEXT_PUBLIC_OPERATOR_NAME` | build | Named in the Privacy Policy and Terms |
| `NEXT_PUBLIC_IMAGE_HOSTS` | build | Extra image origins for the CSP (Cloudinary is built in) |

Local development needs none of these: both apps fall back to `http://localhost:3000` / `http://localhost:4000`.

## Going live checklist

1. **Back up production** (`gh workflow run "Daily Postgres Backup"`) and confirm the dump in R2.
2. Set every "prod" variable above on Railway, plus `APP_ENV=production`, and the frontend variables in Cloudflare.
   Generate secrets with `openssl rand -base64 48`.
3. Resend: verify the sending domain; set `EMAIL_FROM` on it.
4. Google (optional): create an OAuth client (Web), add the redirect URI above, set the two variables.
5. Merge to `main` (Railway deploys the API; migrations 00002–00004 run on startup under an advisory lock),
   then deploy the frontend (`pnpm --filter frontend deploy`).
6. Smoke test: `/healthz`, `/readyz`, sign in with a family account, open the tree, sign up a new account
   (check the email arrives), invite someone.
7. Tell the family: everyone is signed out once (old tokens are rejected) and should add an email to their
   account (Account → Email) so they can reset passwords and accept invites.

## Operations

- **Health**: `GET /healthz` (process up) and `GET /readyz` (Postgres + Redis). The Docker image has a HEALTHCHECK.
- **Migrations**: SQL files in `apps/backend-go/internal/migrations`, applied on startup. Roll back one step with
  `go run github.com/pressly/goose/v3/cmd/goose@v3.29.0 -dir internal/migrations postgres "$DATABASE_URL" down`.
- **Backups**: daily dumps kept 14 days, weekly copies kept 8 weeks (`docs/postgres-backup.md`). Practice a restore
  into a scratch database with `scripts/restore-postgres.sh` every few months.
- **Monitoring**: with New Relic enabled, alert on error rate, p95 latency and 5xx; add an uptime check on `/readyz`.
- **Staging**: run a second Railway environment and Worker with their own database, secrets and URLs before
  shipping risky changes.
- **Dependencies**: Dependabot opens weekly PRs (Go, npm) and monthly ones (Actions, Docker); CI runs lint, types,
  build, Go tests against Postgres + Redis, staticcheck and govulncheck.
