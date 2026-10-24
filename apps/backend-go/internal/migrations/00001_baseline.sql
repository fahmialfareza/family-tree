-- Baseline: the schema GORM AutoMigrate created before versioned migrations.
-- Databases that already have these tables (production, local copies) skip the body.

-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    RETURN;
  END IF;

  CREATE TABLE users (
    id text NOT NULL PRIMARY KEY,
    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    name text,
    username text,
    password text,
    role text
  );
  CREATE INDEX idx_users_deleted_at ON users (deleted_at);
  CREATE UNIQUE INDEX idx_users_username_active ON users (username) WHERE deleted_at IS NULL;

  CREATE TABLE people (
    id text NOT NULL PRIMARY KEY,
    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    name text,
    nickname text,
    address text,
    status text,
    gender text,
    birth_date timestamptz,
    phone text,
    photo_url text
  );
  CREATE INDEX idx_people_deleted_at ON people (deleted_at);

  CREATE TABLE person_owners (
    person_id text NOT NULL,
    user_id text NOT NULL,
    PRIMARY KEY (person_id, user_id),
    CONSTRAINT fk_people_owner_links FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
    CONSTRAINT fk_person_owners_owner FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
  CREATE INDEX idx_person_owners_user_id ON person_owners (user_id);

  CREATE TABLE families (
    id text NOT NULL PRIMARY KEY,
    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    name text,
    person_id text,
    CONSTRAINT fk_families_person FOREIGN KEY (person_id) REFERENCES people (id)
  );
  CREATE INDEX idx_families_deleted_at ON families (deleted_at);
  CREATE INDEX idx_families_person_id ON families (person_id);

  CREATE TABLE family_owners (
    family_id text NOT NULL,
    user_id text NOT NULL,
    PRIMARY KEY (family_id, user_id),
    CONSTRAINT fk_families_owner_links FOREIGN KEY (family_id) REFERENCES families (id) ON DELETE CASCADE,
    CONSTRAINT fk_family_owners_owner FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
  CREATE INDEX idx_family_owners_user_id ON family_owners (user_id);

  CREATE TABLE relationships (
    id text NOT NULL PRIMARY KEY,
    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    from_id text NOT NULL,
    to_id text NOT NULL,
    type text,
    sort_order bigint,
    CONSTRAINT fk_people_relationships FOREIGN KEY (from_id) REFERENCES people (id),
    CONSTRAINT fk_relationships_to FOREIGN KEY (to_id) REFERENCES people (id)
  );
  CREATE INDEX idx_relationships_deleted_at ON relationships (deleted_at);
  CREATE INDEX idx_relationships_from_id ON relationships (from_id);
  CREATE INDEX idx_relationships_to_id ON relationships (to_id);
END $$;
-- +goose StatementEnd

-- +goose Down
-- The baseline is irreversible: dropping it would delete all data.
SELECT 1;
