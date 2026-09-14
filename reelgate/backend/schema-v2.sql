-- Checkpoint schema v2 — multi-user.
--
-- The change that matters: questions are a SHARED bank. A question belongs to a
-- topic, not to a person. Who has seen it lives in `deliveries`. That way the
-- cost of generating questions scales with your heaviest user rather than with
-- how many people sign up.
--
-- Fresh install:  turso db shell <db> < schema-v2.sql
-- Upgrading:      run migrate-v1-to-v2.sql instead.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub  TEXT    NOT NULL UNIQUE,   -- stable Google account id
  email       TEXT,
  name        TEXT,
  mode        TEXT    NOT NULL DEFAULT 'jee',
  daily_cap   INTEGER NOT NULL DEFAULT 40,  -- generation rounds per day
  suspended   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen   INTEGER
);

-- One row per user per day. Cheap way to stop one person burning the key.
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT    NOT NULL,           -- 'YYYY-MM-DD'
  generations INTEGER NOT NULL DEFAULT 0,
  served      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- ---------------------------------------------------------------
-- owner_id NULL  -> public syllabus, everyone reads it (jee, neet)
-- owner_id SET   -> someone's private custom test syllabus
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS syllabus (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  mode       TEXT    NOT NULL,
  subject    TEXT    NOT NULL,
  unit       TEXT,
  topic      TEXT    NOT NULL,
  notes      TEXT,
  difficulty INTEGER NOT NULL DEFAULT 2,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- A public topic and a private one can share a name; they differ by owner.
CREATE UNIQUE INDEX IF NOT EXISTS syllabus_public_idx
  ON syllabus (mode, subject, topic) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS syllabus_private_idx
  ON syllabus (owner_id, mode, subject, topic) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS syllabus_mode_idx ON syllabus (mode);

-- Per-user topic switches. No row means "on" — only exclusions are stored,
-- so a new user costs nothing until they start turning things off.
CREATE TABLE IF NOT EXISTS user_topic (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  syllabus_id INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, syllabus_id)
);

-- ---------------------------------------------------------------
-- The shared bank. No served_at — that is per-user now.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  syllabus_id  INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
  mode         TEXT    NOT NULL,
  stem         TEXT    NOT NULL,
  stem_hash    TEXT    NOT NULL UNIQUE,
  options      TEXT    NOT NULL,
  answer_index INTEGER NOT NULL,
  explanation  TEXT    NOT NULL,
  difficulty   INTEGER NOT NULL DEFAULT 2,
  embedding    F32_BLOB(768),
  flagged      INTEGER NOT NULL DEFAULT 0,  -- reported as wrong; stops being served
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS questions_topic_idx ON questions (syllabus_id, flagged);
CREATE INDEX IF NOT EXISTS questions_mode_idx  ON questions (mode, flagged);
CREATE INDEX IF NOT EXISTS questions_vec_idx
  ON questions (libsql_vector_idx(embedding, 'metric=cosine'));

-- Who has been handed which question. This is what makes the bank shareable.
CREATE TABLE IF NOT EXISTS deliveries (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sent_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS deliveries_user_idx ON deliveries (user_id, sent_at);

-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  syllabus_id  INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
  chosen_index INTEGER,
  correct      INTEGER NOT NULL,
  gate_kind    TEXT,
  latency_ms   INTEGER,
  device       TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS attempts_user_topic_idx ON attempts (user_id, syllabus_id);

-- Reports that a question is wrong. Three reports and it stops being served,
-- which is the only realistic moderation for content you did not write.
CREATE TABLE IF NOT EXISTS reports (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, question_id)
);

-- ---------------------------------------------------------------
-- Per-user, per-topic accuracy. Drives which topic gets generated next.
-- ---------------------------------------------------------------
CREATE VIEW IF NOT EXISTS topic_strength AS
SELECT
  a.user_id,
  s.id   AS syllabus_id,
  s.mode, s.subject, s.topic,
  COUNT(a.id)                 AS attempts,
  COALESCE(SUM(a.correct), 0) AS correct,
  1.0 * SUM(a.correct) / COUNT(a.id) AS accuracy,
  MAX(a.created_at)           AS last_seen
FROM attempts a
JOIN syllabus s ON s.id = a.syllabus_id
GROUP BY a.user_id, s.id;
