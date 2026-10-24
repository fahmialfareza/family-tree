-- Richer person data: partial dates with a precision and a qualifier, death date, places and notes.
-- A date column holds the first instant (UTC) of its period; *_precision says which period (day, month, year)
-- and *_qualifier how sure it is. Both are NULL when the date is unknown.

-- +goose Up
ALTER TABLE people
  ADD COLUMN birth_date_precision text CHECK (birth_date_precision IN ('day', 'month', 'year')),
  ADD COLUMN birth_date_qualifier text CHECK (birth_date_qualifier IN ('exact', 'about', 'before', 'after')),
  ADD COLUMN death_date timestamptz,
  ADD COLUMN death_date_precision text CHECK (death_date_precision IN ('day', 'month', 'year')),
  ADD COLUMN death_date_qualifier text CHECK (death_date_qualifier IN ('exact', 'about', 'before', 'after')),
  ADD COLUMN birth_place text,
  ADD COLUMN death_place text,
  ADD COLUMN notes text;

-- Existing birth dates were always entered as full dates.
UPDATE people SET birth_date_precision = 'day', birth_date_qualifier = 'exact' WHERE birth_date IS NOT NULL;

-- +goose Down
ALTER TABLE people
  DROP COLUMN birth_date_precision,
  DROP COLUMN birth_date_qualifier,
  DROP COLUMN death_date,
  DROP COLUMN death_date_precision,
  DROP COLUMN death_date_qualifier,
  DROP COLUMN birth_place,
  DROP COLUMN death_place,
  DROP COLUMN notes;
