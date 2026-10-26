-- Invite links: one link, many people. Anyone signed in who opens it before it expires joins the tree with
-- its role (editor or viewer; owners are only made by email invite or role change). Only the token's hash
-- is stored, like email invites.

-- +goose Up
CREATE TABLE tree_invite_links (
  id text NOT NULL PRIMARY KEY,
  tree_id text NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by text REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tree_invite_links_tree_id ON tree_invite_links (tree_id);

-- +goose Down
DROP TABLE tree_invite_links;
