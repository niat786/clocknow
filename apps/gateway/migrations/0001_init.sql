-- API keys are stored only as SHA-256 hashes; the plain key is shown once, at sign-up.
CREATE TABLE keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash    TEXT NOT NULL UNIQUE,
  prefix      TEXT NOT NULL,                 -- first characters, so a person can recognise a key
  email       TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'free',  -- free | developer | business | enterprise
  created_at  INTEGER NOT NULL,              -- Unix seconds
  revoked_at  INTEGER
);
CREATE INDEX keys_email ON keys (email);

-- One row per subject and calendar month (UTC). Subjects: "key:<id>" or "ip:<hash>".
CREATE TABLE usage (
  subject TEXT NOT NULL,
  period  TEXT NOT NULL,                     -- YYYY-MM
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, period)
);

-- Magic-link sign-ups: the token is stored hashed, expires, and works once.
CREATE TABLE signups (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX signups_email ON signups (email, created_at);
