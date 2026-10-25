-- Sign in with Apple (required by the App Store because Google sign-in is offered in the iOS app).
-- apple_refresh_token / apple_client_id are kept only so the Apple tokens can be revoked when the account
-- is deleted, as Apple requires; both are empty when the server has no Apple signing key configured.

-- +goose Up
ALTER TABLE users
  ADD COLUMN apple_sub text,
  ADD COLUMN apple_client_id text,
  ADD COLUMN apple_refresh_token text;
CREATE UNIQUE INDEX idx_users_apple_sub ON users (apple_sub) WHERE apple_sub IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_users_apple_sub;
ALTER TABLE users DROP COLUMN apple_refresh_token, DROP COLUMN apple_client_id, DROP COLUMN apple_sub;
