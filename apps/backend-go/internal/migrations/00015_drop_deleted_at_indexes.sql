-- The last deleted_at indexes (00014 dropped the others). No query looks rows up by deleted_at: soft-deleted
-- rows are always filtered alongside an indexed column (id, tree_id, from_id), so these only cost writes.
-- Dropped CONCURRENTLY so production writes are not blocked; that cannot run inside a transaction.

-- +goose NO TRANSACTION

-- +goose Up
DROP INDEX CONCURRENTLY IF EXISTS idx_families_deleted_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_relationships_deleted_at;

-- +goose Down
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationships_deleted_at ON relationships (deleted_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_families_deleted_at ON families (deleted_at);
