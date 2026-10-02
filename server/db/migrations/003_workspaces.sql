-- Workspaces: every business that signs up gets its own private copy of
-- the data. Everything that existed before this migration becomes the
-- "default" workspace, owned by the OWNER_EMAIL account.

CREATE TABLE marketbing.workspaces (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO marketbing.workspaces (id, name) VALUES ('default', 'NovaSkin (Demo Workspace)');

/* ---- accounts belong to one workspace, as its owner or a team member ---- */

ALTER TABLE marketbing.users
  ADD COLUMN workspace_id text NOT NULL DEFAULT 'default'
    REFERENCES marketbing.workspaces (id) ON DELETE CASCADE,
  ADD COLUMN role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member'));
ALTER TABLE marketbing.users ALTER COLUMN workspace_id DROP DEFAULT, ALTER COLUMN role DROP DEFAULT;
CREATE INDEX users_workspace_idx ON marketbing.users (workspace_id);

CREATE TABLE marketbing.invites (
  id           text PRIMARY KEY,
  token_hash   text NOT NULL UNIQUE,
  workspace_id text NOT NULL REFERENCES marketbing.workspaces (id) ON DELETE CASCADE,
  email        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  UNIQUE (workspace_id, email)
);

/* ---- business data: keyed by workspace ---- */

-- Foreign keys point at the single-column keys being replaced, so drop them first.
ALTER TABLE marketbing.campaigns    DROP CONSTRAINT campaigns_influencer_id_fkey,
                                    DROP CONSTRAINT campaigns_product_id_fkey;
ALTER TABLE marketbing.alerts       DROP CONSTRAINT alerts_influencer_id_fkey;
ALTER TABLE marketbing.positions    DROP CONSTRAINT positions_influencer_id_fkey;
ALTER TABLE marketbing.transactions DROP CONSTRAINT transactions_influencer_id_fkey;

ALTER TABLE marketbing.products     ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';
ALTER TABLE marketbing.influencers  ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';
ALTER TABLE marketbing.campaigns    ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';
ALTER TABLE marketbing.alerts       ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';
ALTER TABLE marketbing.wallet       ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';
ALTER TABLE marketbing.positions    ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';
ALTER TABLE marketbing.transactions ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';
ALTER TABLE marketbing.runs         ADD COLUMN workspace_id text NOT NULL DEFAULT 'default';

ALTER TABLE marketbing.products DROP CONSTRAINT products_pkey, ADD PRIMARY KEY (workspace_id, id);
ALTER TABLE marketbing.influencers DROP CONSTRAINT influencers_pkey, ADD PRIMARY KEY (workspace_id, id);
ALTER TABLE marketbing.campaigns DROP CONSTRAINT campaigns_pkey,
  ADD PRIMARY KEY (workspace_id, influencer_id, product_id),
  ADD FOREIGN KEY (workspace_id, influencer_id) REFERENCES marketbing.influencers (workspace_id, id),
  ADD FOREIGN KEY (workspace_id, product_id) REFERENCES marketbing.products (workspace_id, id);
ALTER TABLE marketbing.alerts DROP CONSTRAINT alerts_pkey,
  ADD PRIMARY KEY (workspace_id, id),
  ADD FOREIGN KEY (workspace_id, influencer_id) REFERENCES marketbing.influencers (workspace_id, id);
DROP INDEX marketbing.alerts_influencer_idx;
CREATE INDEX alerts_influencer_idx ON marketbing.alerts (workspace_id, influencer_id);
-- The wallet was a single row (id = 1); now it is one row per workspace.
ALTER TABLE marketbing.wallet DROP COLUMN id, ADD PRIMARY KEY (workspace_id);
ALTER TABLE marketbing.positions DROP CONSTRAINT positions_pkey,
  ADD PRIMARY KEY (workspace_id, influencer_id),
  ADD FOREIGN KEY (workspace_id, influencer_id) REFERENCES marketbing.influencers (workspace_id, id);
ALTER TABLE marketbing.transactions DROP CONSTRAINT transactions_pkey,
  ADD PRIMARY KEY (workspace_id, id),
  ADD FOREIGN KEY (workspace_id, influencer_id) REFERENCES marketbing.influencers (workspace_id, id);
DROP INDEX marketbing.transactions_at_idx;
CREATE INDEX transactions_at_idx ON marketbing.transactions (workspace_id, at DESC);
ALTER TABLE marketbing.runs DROP CONSTRAINT runs_pkey, ADD PRIMARY KEY (workspace_id, id);

-- Every row must name a real workspace; deleting a workspace deletes its data.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'influencers', 'campaigns', 'alerts', 'wallet', 'positions', 'transactions', 'runs']
  LOOP
    EXECUTE format('ALTER TABLE marketbing.%I ALTER COLUMN workspace_id DROP DEFAULT', t);
    EXECUTE format(
      'ALTER TABLE marketbing.%I ADD FOREIGN KEY (workspace_id) REFERENCES marketbing.workspaces (id) ON DELETE CASCADE',
      t
    );
  END LOOP;
END $$;

ALTER TABLE marketbing.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.invites    ENABLE ROW LEVEL SECURITY;
