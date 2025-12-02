# Family Tree Backend (Go)

Go backend implementation using Gin framework, maintaining API compatibility with the Node.js version.

## Environment Variables

### Required

- `MONGO_URI` - MongoDB connection string (e.g., `mongodb://localhost:27017`)
- `MONGO_DB` - MongoDB database name (e.g., `family-tree`)
- `JWT_SECRET` - Secret key for JWT token signing
- `PORT` - Server port (default: `4001`)

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
- MongoDB with soft delete support (all collections)
- Cloudinary image upload integration with local fallback
- Redis-based rate limiting (600 requests/minute, sliding window)
- New Relic APM integration
- Family tree builder with D3-compatible output
- CORS, compression, HPP (HTTP Parameter Pollution) protection

## Soft Delete

All collections (users, people, families, relationships) implement soft delete:

- Queries automatically filter `deleted: {$ne: true}`
- Delete operations set `deleted: true` and `deletedAt: timestamp`
- Matches `mongoose-delete` plugin behavior from Node.js version

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
