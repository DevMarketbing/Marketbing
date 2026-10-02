-- Login accounts and sign-in sessions. Passwords are stored only as scrypt
-- hashes and sessions only as SHA-256 hashes of their tokens, so a leaked
-- table cannot be used to sign in.

CREATE TABLE marketbing.users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketbing.sessions (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES marketbing.users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON marketbing.sessions (user_id);

ALTER TABLE marketbing.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketbing.sessions ENABLE ROW LEVEL SECURITY;
