-- Trigram indexes for the people search (name ILIKE '%q%' OR nickname ILIKE '%q%'), which otherwise reads every
-- person in the tree; pg_trgm is a trusted extension, so the database owner can create it.
-- The admin dashboard counts active users by sessions.last_used_at and lists the newest users, so those get
-- indexes too. Both tables are small to write to: users rarely change, and session refreshes already rewrite
-- the indexed refresh token hash.
-- Built CONCURRENTLY so production writes are not blocked; that cannot run inside a transaction.

-- +goose NO TRANSACTION

-- +goose Up
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_name_trgm ON people USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_nickname_trgm ON people USING gin (nickname gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_last_used_at ON sessions (last_used_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at_active ON users (created_at) WHERE deleted_at IS NULL;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS idx_users_created_at_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_sessions_last_used_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_people_nickname_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_people_name_trgm;
-- pg_trgm is left installed: dropping an extension other objects may have started using is not safe to undo.
