-- People copied from another tree remember their source, so copying the same branch again reuses the
-- existing copies instead of duplicating them. Copies are independent: nothing flows back to the source.

-- +goose Up
ALTER TABLE people ADD COLUMN source_person_id text REFERENCES people (id) ON DELETE SET NULL;
CREATE INDEX idx_people_source_person ON people (tree_id, source_person_id) WHERE source_person_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_people_source_person;
ALTER TABLE people DROP COLUMN source_person_id;
