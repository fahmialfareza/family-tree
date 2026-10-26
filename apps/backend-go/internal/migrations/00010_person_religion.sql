-- Optional religion of a person. The tree marks deceased people by it (Alm./Almh., a cross, or a neutral
-- marker when NULL), so a family is never shown a symbol of another faith.

-- +goose Up
ALTER TABLE people ADD COLUMN religion text
  CHECK (religion IN ('islam', 'protestant', 'catholic', 'hindu', 'buddhist', 'confucian', 'other'));

-- +goose Down
ALTER TABLE people DROP COLUMN religion;
