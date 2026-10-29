-- The admin dashboard counts and charts live trees and people by created_at within a period, so they get
-- created_at indexes over live rows (users got one in 00013). These replace the deleted_at indexes on the same
-- tables: no query looks rows up by deleted_at, and the live-row counts can read the new partial indexes instead.
-- A person's relationships are loaded by from_id in (created_at, id) order, so that index now carries the order;
-- it still leads with from_id for the people foreign key checks.
-- Built CONCURRENTLY so production writes are not blocked; that cannot run inside a transaction.

-- +goose NO TRANSACTION

-- +goose Up
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_created_at_active ON people (created_at) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trees_created_at_active ON trees (created_at) WHERE deleted_at IS NULL;
DROP INDEX CONCURRENTLY IF EXISTS idx_people_deleted_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_trees_deleted_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_deleted_at;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationships_from_created ON relationships (from_id, created_at, id);
DROP INDEX CONCURRENTLY IF EXISTS idx_relationships_from_id;

-- +goose Down
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationships_from_id ON relationships (from_id);
DROP INDEX CONCURRENTLY IF EXISTS idx_relationships_from_created;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trees_deleted_at ON trees (deleted_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_deleted_at ON people (deleted_at);
DROP INDEX CONCURRENTLY IF EXISTS idx_trees_created_at_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_people_created_at_active;
