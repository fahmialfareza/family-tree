-- AI assistant ("ask about this tree"). Off by default: turning it on sends the tree's names, dates, places,
-- addresses and notes to the configured AI providers when members ask questions, so only owners decide.

-- +goose Up
ALTER TABLE trees ADD COLUMN assistant_enabled boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE trees DROP COLUMN assistant_enabled;
