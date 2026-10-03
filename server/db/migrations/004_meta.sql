-- Meta (Facebook & Instagram) connections: one per workspace. The document
-- holds the connected Facebook account, its Pages, Instagram accounts and
-- ad accounts; every access token inside it is encrypted (AES-256-GCM)
-- with a key derived from META_APP_SECRET, so the table alone is useless.

CREATE TABLE marketbing.meta_connections (
  workspace_id text PRIMARY KEY REFERENCES marketbing.workspaces (id) ON DELETE CASCADE,
  meta_user_id text NOT NULL,
  doc          jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meta_connections_user_idx ON marketbing.meta_connections (meta_user_id);

-- Data deletion requests Meta sent us (see /api/meta/data-deletion), so the
-- status page Meta links people to can confirm the deletion happened.
CREATE TABLE marketbing.meta_deletion_requests (
  code         text PRIMARY KEY,
  completed_at timestamptz NOT NULL
);

ALTER TABLE marketbing.meta_connections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.meta_deletion_requests ENABLE ROW LEVEL SECURITY;
