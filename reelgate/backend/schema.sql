-- Checkpoint schema (Turso / libSQL)
-- Apply with:  turso db shell <your-db> < schema.sql

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
-- Syllabus: what questions are allowed to be about.
-- mode is 'jee', 'neet', or any custom name you invent.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS syllabus (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mode       TEXT    NOT NULL,
  subject    TEXT    NOT NULL,
  unit       TEXT,
  topic      TEXT    NOT NULL,
  notes      TEXT,                        -- free text steered into the prompt
  difficulty INTEGER NOT NULL DEFAULT 2,  -- 1 easy, 2 medium, 3 hard
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (mode, subject, topic)
);

CREATE INDEX IF NOT EXISTS syllabus_mode_idx ON syllabus (mode, active);

-- ---------------------------------------------------------------
-- Questions. Generated once, stored forever, served at most once.
-- embedding is used to reject near-duplicates at generation time.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  syllabus_id  INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
  mode         TEXT    NOT NULL,
  stem         TEXT    NOT NULL,
  stem_hash    TEXT    NOT NULL UNIQUE,   -- sha256 of the normalised stem
  options      TEXT    NOT NULL,          -- JSON array of 4 strings
  answer_index INTEGER NOT NULL,
  explanation  TEXT    NOT NULL,
  difficulty   INTEGER NOT NULL DEFAULT 2,
  embedding    F32_BLOB(768),
  served_at    INTEGER,                   -- NULL means still in the pool
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS questions_pool_idx    ON questions (mode, served_at);
CREATE INDEX IF NOT EXISTS questions_syllabus_idx ON questions (syllabus_id);
CREATE INDEX IF NOT EXISTS questions_vec_idx
  ON questions (libsql_vector_idx(embedding, 'metric=cosine'));

-- ---------------------------------------------------------------
-- Every answer, for weakness weighting and your stats page.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  syllabus_id  INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
  chosen_index INTEGER,
  correct      INTEGER NOT NULL,
  gate_kind    TEXT,                      -- 'reel' or 'chat'
  latency_ms   INTEGER,
  device       TEXT,                      -- 'extension' or 'android'
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS attempts_syllabus_idx ON attempts (syllabus_id);
CREATE INDEX IF NOT EXISTS attempts_time_idx     ON attempts (created_at);

-- ---------------------------------------------------------------
-- Per-topic accuracy. Drives which topic gets generated next:
-- the ones you keep getting wrong come up more often.
-- ---------------------------------------------------------------
CREATE VIEW IF NOT EXISTS topic_strength AS
SELECT
  s.id                                           AS syllabus_id,
  s.mode, s.subject, s.topic,
  COUNT(a.id)                                    AS attempts,
  COALESCE(SUM(a.correct), 0)                    AS correct,
  CASE WHEN COUNT(a.id) = 0 THEN NULL
       ELSE 1.0 * SUM(a.correct) / COUNT(a.id) END AS accuracy,
  MAX(a.created_at)                              AS last_seen
FROM syllabus s
LEFT JOIN attempts a ON a.syllabus_id = s.id
GROUP BY s.id;
