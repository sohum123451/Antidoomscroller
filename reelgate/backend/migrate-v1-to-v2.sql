-- Migrate a v1 (single-user) Checkpoint database to v2.
--
-- Back up first:
--   turso db shell <db> .dump > backup-before-v2.sql
--
-- Then:
--   turso db shell <db> < migrate-v1-to-v2.sql
--
-- Your existing questions, syllabus and answer history are kept. Everything
-- that already existed is attributed to user 1, which is you.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- ---- new tables ------------------------------------------------
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  email      TEXT,
  name       TEXT,
  mode       TEXT NOT NULL DEFAULT 'jee',
  daily_cap  INTEGER NOT NULL DEFAULT 40,
  suspended  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen  INTEGER
);

-- Placeholder for you. Replace the sub with your real Google id after your
-- first sign-in, or just delete this row and let sign-in create a fresh one:
--   UPDATE users SET google_sub = '<your sub>' WHERE id = 1;
INSERT INTO users (id, google_sub, email, name) VALUES (1, 'legacy-owner', NULL, 'Owner');

CREATE TABLE usage_daily (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  generations INTEGER NOT NULL DEFAULT 0,
  served      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE user_topic (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  syllabus_id INTEGER NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, syllabus_id)
);

CREATE TABLE deliveries (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  sent_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE reports (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, question_id)
);

-- ---- syllabus: add owner_id, move `active` into user_topic -----
ALTER TABLE syllabus ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Anything you switched off becomes your personal exclusion.
INSERT INTO user_topic (user_id, syllabus_id, enabled)
SELECT 1, id, 0 FROM syllabus WHERE active = 0;

-- jee and neet stay public; anything else was your own custom syllabus.
UPDATE syllabus SET owner_id = 1 WHERE mode NOT IN ('jee', 'neet');

DROP INDEX IF EXISTS syllabus_mode_idx;
CREATE UNIQUE INDEX syllabus_public_idx
  ON syllabus (mode, subject, topic) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX syllabus_private_idx
  ON syllabus (owner_id, mode, subject, topic) WHERE owner_id IS NOT NULL;
CREATE INDEX syllabus_mode_idx ON syllabus (mode);

-- ---- questions: served_at becomes a delivery row ---------------
INSERT INTO deliveries (user_id, question_id, sent_at)
SELECT 1, id, served_at FROM questions WHERE served_at IS NOT NULL;

CREATE TABLE questions_new (
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
  flagged      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO questions_new
  (id, syllabus_id, mode, stem, stem_hash, options, answer_index, explanation,
   difficulty, embedding, created_at)
SELECT id, syllabus_id, mode, stem, stem_hash, options, answer_index, explanation,
       difficulty, embedding, created_at
FROM questions;

DROP TABLE questions;
ALTER TABLE questions_new RENAME TO questions;

CREATE INDEX questions_topic_idx ON questions (syllabus_id, flagged);
CREATE INDEX questions_mode_idx  ON questions (mode, flagged);
CREATE INDEX questions_vec_idx
  ON questions (libsql_vector_idx(embedding, 'metric=cosine'));

-- ---- attempts: add user_id -------------------------------------
ALTER TABLE attempts ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE attempts SET user_id = 1 WHERE user_id IS NULL;
CREATE INDEX attempts_user_topic_idx ON attempts (user_id, syllabus_id);

-- ---- rebuild the view against the new shape --------------------
DROP VIEW IF EXISTS topic_strength;
CREATE VIEW topic_strength AS
SELECT
  a.user_id,
  s.id AS syllabus_id,
  s.mode, s.subject, s.topic,
  COUNT(a.id) AS attempts,
  COALESCE(SUM(a.correct), 0) AS correct,
  1.0 * SUM(a.correct) / COUNT(a.id) AS accuracy,
  MAX(a.created_at) AS last_seen
FROM attempts a
JOIN syllabus s ON s.id = a.syllabus_id
GROUP BY a.user_id, s.id;

COMMIT;

PRAGMA foreign_keys = ON;

-- The old `active` column on syllabus is now unused. SQLite keeps it around
-- harmlessly; drop it once you have confirmed everything works:
--   ALTER TABLE syllabus DROP COLUMN active;
