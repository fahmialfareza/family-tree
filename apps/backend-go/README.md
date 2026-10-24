# Family Tree Backend (Go)

Go backend implementation using Gin framework, maintaining API compatibility with the Node.js version.

## Environment Variables

### Required

- `DATABASE_URL` - Postgres connection string (e.g., `postgres://user:pass@localhost:5432/family-tree?sslmode=disable`)
- `JWT_SECRET` - Secret key for JWT token signing
- `PORT` - Server port (default: `4000`)

### Optional

- `REDIS_URL` - Redis connection URL for rate limiting (e.g., `redis://localhost:6379`)
- `NEW_RELIC_APP_NAME` - Application name for New Relic APM
- `NEW_RELIC_LICENSE_KEY` - New Relic license key
- `CLOUDINARY_URL` - Cloudinary connection URL (format: `cloudinary://api_key:api_secret@cloud_name`)
  - If not set, uploads will be saved to local storage
- `UPLOAD_DIR` - Directory for local file uploads (default: `./tmp`)
  - Only used when `CLOUDINARY_URL` is not set
- `TREE_DEBUG` - Enable debug logging for tree endpoints (set to `1` to enable)

## Running the Server

```bash
# Development
go run ./main.go

# Build
go build ./...

# Production
go build -o backend ./main.go
./backend
```

## Features

- JWT authentication with bcrypt password hashing
- Postgres via GORM with soft delete support (all tables); schema managed by versioned SQL migrations (goose) applied on startup
- Cloudinary image upload integration with local fallback
- Redis-based rate limiting (600 requests/minute, sliding window)
- New Relic APM integration
- Family tree builder with D3-compatible output
- CORS, compression, HPP (HTTP Parameter Pollution) protection

## Soft Delete

All tables (users, people, families, relationships) implement soft delete via `gorm.DeletedAt`:

- Queries automatically filter `deleted_at IS NULL`
- Delete operations set `deleted_at` instead of removing the row
- Ownership links (`person_owners`, `family_owners`) are plain join tables and are replaced, not soft-deleted

## Database

- Schema is defined by SQL migrations in `internal/migrations/` (embedded in the binary, applied by goose on
  startup under a Postgres advisory lock). Add a new numbered file for every schema change; never edit an applied one.
  Inspect or roll back with the goose CLI, e.g.
  `go run github.com/pressly/goose/v3/cmd/goose@v3.29.0 -dir internal/migrations postgres "$DATABASE_URL" status`.
- GORM row types live in `internal/schema.go`; API structs in `internal/models.go` are mapped from those rows.
- Tree workspaces: every person, family and relationship has a `tree_id`; users reach a tree through `tree_members`
  (`owner` / `editor` / `viewer`). Trees with `branch_scoped = true` additionally limit editors and viewers to the
  people shared with them through `person_owners`. Pre-workspace data lives in one branch-scoped tree (migration 00002).
  Until the API is tree-scoped, legacy routes place new rows in the creating user's first tree.
- IDs are `text`: rows migrated from MongoDB keep their 24-char hex ObjectIDs, new rows get UUIDv7 strings.
- `cmd/mongo2pg` is a one-off tool that copies the legacy MongoDB data into Postgres
  (`MONGO_URI`, `MONGO_DB`, `DATABASE_URL`; truncates and reloads, safe to re-run). Remove it after the cutover.
- Backups: see `docs/postgres-backup.md`.

## API Compatibility

All endpoints maintain identical request/response shapes with the Node.js backend:

- `/api/auth/*` - Authentication (signin, signup)
- `/api/person/*` - Person CRUD
- `/api/family/*` - Family CRUD
- `/api/relationship/*` - Relationship CRUD
- `/api/tree/:personId?mode=parent|child` - Family tree endpoint

### Tree Modes (Inverted Naming)

**Important:** Mode naming is intentionally inverted to match Node.js behavior:

- `mode=parent` - Shows **children** of the person (descendants)
- `mode=child` - Shows **parents** of the person (ancestors)
