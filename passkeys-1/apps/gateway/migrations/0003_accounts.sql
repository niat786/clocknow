-- Accounts: an email address is the account; passkeys and magic links are two ways to sign in to it.
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- One row per registered authenticator. The public key is stored; the private key never leaves the device.
CREATE TABLE passkeys (
  id           TEXT PRIMARY KEY,             -- credential id, base64url
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,                -- base64url COSE key
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT,                         -- JSON array, as reported by the browser
  name         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_user ON passkeys (user_id);

-- Session tokens are stored hashed, like API keys.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- A WebAuthn challenge is valid once and for a few minutes.
CREATE TABLE challenges (
  id         TEXT PRIMARY KEY,
  challenge  TEXT NOT NULL,
  purpose    TEXT NOT NULL,                  -- register | login
  user_id    INTEGER,                        -- set for register
  expires_at INTEGER NOT NULL
);

ALTER TABLE keys ADD COLUMN user_id INTEGER REFERENCES users (id);
CREATE INDEX keys_user ON keys (user_id);

-- Magic links now serve two purposes: handing out a key ("key") and signing in ("login").
ALTER TABLE signups ADD COLUMN purpose TEXT NOT NULL DEFAULT 'key';
