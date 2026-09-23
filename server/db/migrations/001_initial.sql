-- Initial Marketbing schema. Lives in its own "marketbing" schema so that
-- Supabase's auto-generated public REST API (which serves "public") never
-- exposes it. RLS is enabled with no policies as a second guard: only the
-- server's own database role (the table owner) can read or write.

CREATE TABLE marketbing.products (
  id  text PRIMARY KEY,
  doc jsonb NOT NULL
);

CREATE TABLE marketbing.influencers (
  id  text PRIMARY KEY,
  doc jsonb NOT NULL
);

CREATE TABLE marketbing.campaigns (
  influencer_id text NOT NULL REFERENCES marketbing.influencers (id),
  product_id    text NOT NULL REFERENCES marketbing.products (id),
  doc           jsonb NOT NULL,
  PRIMARY KEY (influencer_id, product_id)
);

CREATE TABLE marketbing.alerts (
  id            text PRIMARY KEY,
  influencer_id text NOT NULL REFERENCES marketbing.influencers (id),
  resolved      boolean NOT NULL DEFAULT false,
  doc           jsonb NOT NULL
);
CREATE INDEX alerts_influencer_idx ON marketbing.alerts (influencer_id);

CREATE TABLE marketbing.wallet (
  id           smallint PRIMARY KEY CHECK (id = 1),
  balance_lakh numeric(14, 2) NOT NULL CHECK (balance_lakh >= 0)
);

CREATE TABLE marketbing.positions (
  influencer_id text PRIMARY KEY REFERENCES marketbing.influencers (id),
  invested_lakh numeric(14, 2) NOT NULL CHECK (invested_lakh >= 0)
);

CREATE TABLE marketbing.transactions (
  id            text PRIMARY KEY,
  influencer_id text NOT NULL REFERENCES marketbing.influencers (id),
  type          text NOT NULL CHECK (type IN ('invest', 'divest')),
  amount_lakh   numeric(14, 2) NOT NULL CHECK (amount_lakh > 0),
  at            timestamptz NOT NULL
);
CREATE INDEX transactions_at_idx ON marketbing.transactions (at DESC);

CREATE TABLE marketbing.runs (
  id         text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  doc        jsonb NOT NULL
);

ALTER TABLE marketbing.products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.influencers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.wallet       ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.runs         ENABLE ROW LEVEL SECURITY;
