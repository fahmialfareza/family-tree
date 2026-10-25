-- The account's interface language ("en" or "id"). NULL means not chosen yet: the website then uses the
-- browser's cookie, the visitor's country, then the browser language.

-- +goose Up
ALTER TABLE users ADD COLUMN locale text CHECK (locale IN ('en', 'id'));

-- +goose Down
ALTER TABLE users DROP COLUMN locale;
