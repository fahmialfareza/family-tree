-- Revocable login sessions and single-use auth tokens (email verification, password reset, OAuth login hand-off).
-- Usernames become optional: new accounts sign up with an email; existing family accounts keep their username.
-- Invariant kept by the code: users.email is either verified, or belongs to a pending signup that cannot sign
-- in yet. Email changes stay in auth_tokens until the new address is verified.

-- +goose Up
CREATE TABLE sessions (
  id text NOT NULL PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash text UNIQUE,
  -- The hash it replaced on the last rotation: presenting it again means the token leaked, so the session is revoked.
  prev_refresh_token_hash text,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_prev_refresh_token_hash ON sessions (prev_refresh_token_hash);

CREATE TABLE auth_tokens (
  id text NOT NULL PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'oauth_login')),
  token_hash text NOT NULL UNIQUE,
  -- verify_email: the address being verified (for an email change, the new address; applied on verification).
  email text,
  -- oauth_login: hash of a value held by the browser that started the sign-in, checked on exchange.
  binding_hash text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_tokens_user_id ON auth_tokens (user_id, purpose);

-- Empty usernames would collide in the unique index once usernames are optional.
UPDATE users SET username = NULL WHERE username = '';
UPDATE users SET email = NULL WHERE email = '';

-- +goose Down
DROP TABLE auth_tokens;
DROP TABLE sessions;
