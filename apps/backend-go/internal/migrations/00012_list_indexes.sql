-- Indexes for the list order (created_at, id) within a tree, which the people and family lists sort by and the
-- people page cursor seeks on, so a page no longer reads and sorts the whole tree. They lead with tree_id, so
-- they replace the single-column tree_id indexes (still used by unscoped queries and the tree delete cascade).
-- Copies are also looked up by their source alone (the ON DELETE SET NULL check when a tree's people are
-- deleted, and finding a copy's source), so source_person_id now leads that index.
-- Built CONCURRENTLY so production writes are not blocked; that cannot run inside a transaction.

-- +goose NO TRANSACTION

-- +goose Up
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_tree_created ON people (tree_id, created_at, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_families_tree_created ON families (tree_id, created_at, id);
DROP INDEX CONCURRENTLY IF EXISTS idx_people_tree_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_families_tree_id;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_source_person_tree
  ON people (source_person_id, tree_id) WHERE source_person_id IS NOT NULL;
DROP INDEX CONCURRENTLY IF EXISTS idx_people_source_person;

-- +goose Down
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_source_person
  ON people (tree_id, source_person_id) WHERE source_person_id IS NOT NULL;
DROP INDEX CONCURRENTLY IF EXISTS idx_people_source_person_tree;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_tree_id ON people (tree_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_families_tree_id ON families (tree_id);
DROP INDEX CONCURRENTLY IF EXISTS idx_families_tree_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_people_tree_created;
