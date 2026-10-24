-- Tree workspaces: every person, family and relationship belongs to exactly one tree,
-- and users reach a tree through tree_members. Existing data is moved into a single
-- branch-scoped tree so each user keeps seeing exactly what person_owners allowed before.

-- +goose Up
CREATE TABLE trees (
  id text NOT NULL PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  branch_scoped boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_trees_deleted_at ON trees (deleted_at);

CREATE TABLE tree_members (
  tree_id text NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tree_id, user_id)
);
CREATE INDEX idx_tree_members_user_id ON tree_members (user_id);

CREATE TABLE tree_invites (
  id text NOT NULL PRIMARY KEY,
  tree_id text NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by text REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tree_invites_tree_id ON tree_invites (tree_id);

ALTER TABLE users
  ADD COLUMN email text,
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN google_sub text;
CREATE UNIQUE INDEX idx_users_email_active ON users (lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

ALTER TABLE people ADD COLUMN tree_id text REFERENCES trees (id) ON DELETE CASCADE;
ALTER TABLE families ADD COLUMN tree_id text REFERENCES trees (id) ON DELETE CASCADE;
ALTER TABLE relationships ADD COLUMN tree_id text REFERENCES trees (id) ON DELETE CASCADE;

-- Backfill: one tree holding all existing rows (soft-deleted included, so tree_id can be NOT NULL).
-- Admins become owners (see everything); other users become editors limited to their branch.
-- +goose StatementBegin
DO $$
DECLARE
  new_tree_id text := gen_random_uuid()::text;
  first_admin text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users)
     AND NOT EXISTS (SELECT 1 FROM people)
     AND NOT EXISTS (SELECT 1 FROM families)
     AND NOT EXISTS (SELECT 1 FROM relationships) THEN
    RETURN;
  END IF;

  SELECT id INTO first_admin FROM users
  WHERE role = 'admin' AND deleted_at IS NULL
  ORDER BY created_at NULLS LAST, id
  LIMIT 1;

  INSERT INTO trees (id, name, created_by, branch_scoped)
  VALUES (new_tree_id, 'Alfareza Family', first_admin, true);

  INSERT INTO tree_members (tree_id, user_id, role)
  SELECT new_tree_id, id, CASE WHEN role = 'admin' THEN 'owner' ELSE 'editor' END
  FROM users
  WHERE deleted_at IS NULL;

  UPDATE people SET tree_id = new_tree_id;
  UPDATE families SET tree_id = new_tree_id;
  UPDATE relationships SET tree_id = new_tree_id;
END $$;
-- +goose StatementEnd

ALTER TABLE people ALTER COLUMN tree_id SET NOT NULL;
ALTER TABLE families ALTER COLUMN tree_id SET NOT NULL;
ALTER TABLE relationships ALTER COLUMN tree_id SET NOT NULL;
CREATE INDEX idx_people_tree_id ON people (tree_id);
CREATE INDEX idx_families_tree_id ON families (tree_id);
CREATE INDEX idx_relationships_tree_id ON relationships (tree_id);
CREATE UNIQUE INDEX idx_relationships_unique_active
  ON relationships (tree_id, from_id, to_id, type) WHERE deleted_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_relationships_unique_active;
ALTER TABLE relationships DROP COLUMN tree_id;
ALTER TABLE families DROP COLUMN tree_id;
ALTER TABLE people DROP COLUMN tree_id;
DROP INDEX IF EXISTS idx_users_google_sub;
DROP INDEX IF EXISTS idx_users_email_active;
ALTER TABLE users DROP COLUMN google_sub, DROP COLUMN email_verified_at, DROP COLUMN email;
DROP TABLE tree_invites;
DROP TABLE tree_members;
DROP TABLE trees;
