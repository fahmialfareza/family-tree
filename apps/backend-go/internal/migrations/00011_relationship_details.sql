-- Details of a relationship, written to both rows of a pair (parent/child, or spouse/spouse):
-- kind: how a parent and child are related (NULL = birth, so existing links stay as they were);
-- partner_status and the start/end dates and place: a couple's status, marriage and divorce or separation.

-- +goose Up
ALTER TABLE relationships
  ADD COLUMN kind text CHECK (kind IN ('birth', 'adopted', 'step', 'foster', 'guardian', 'milk')),
  ADD COLUMN partner_status text CHECK (partner_status IN ('married', 'divorced', 'separated', 'engaged', 'partner')),
  ADD COLUMN start_date timestamptz,
  ADD COLUMN start_date_precision text CHECK (start_date_precision IN ('day', 'month', 'year')),
  ADD COLUMN start_date_qualifier text CHECK (start_date_qualifier IN ('exact', 'about', 'before', 'after')),
  ADD COLUMN start_place text,
  ADD COLUMN end_date timestamptz,
  ADD COLUMN end_date_precision text CHECK (end_date_precision IN ('day', 'month', 'year')),
  ADD COLUMN end_date_qualifier text CHECK (end_date_qualifier IN ('exact', 'about', 'before', 'after'));

-- +goose Down
ALTER TABLE relationships
  DROP COLUMN kind,
  DROP COLUMN partner_status,
  DROP COLUMN start_date,
  DROP COLUMN start_date_precision,
  DROP COLUMN start_date_qualifier,
  DROP COLUMN start_place,
  DROP COLUMN end_date,
  DROP COLUMN end_date_precision,
  DROP COLUMN end_date_qualifier;
