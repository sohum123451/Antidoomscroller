import { Turso } from "./turso.js";
import { generateQuestions, embed } from "./gemini.js";
import { authenticate, usage, bumpUsage } from "./auth.js";

const UNSEEN_MIN = 12;      // top up when a user's unseen count drops below this
const BANK_TARGET = 40;     // questions the cron tries to keep per public topic
const BATCH = 6;            // questions requested from Gemini per call
const NOTES_MAX = 300;      // free text reaching the model, kept short on purpose

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });

async function stemHash(stem) {
  const norm = stem.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------
 * Generation. Writes into the shared bank, so one person's generation
 * is everybody's gain.
 * ---------------------------------------------------------------- */
async function generateBatch(env, db, topic) {
  const prior = await db.query(
    `SELECT stem FROM questions WHERE syllabus_id = ? ORDER BY created_at DESC LIMIT 40`,
    [topic.id]
  );

  const drafts = await generateQuestions(env, {
    subject: topic.subject,
    unit: topic.unit,
    topic: topic.topic,
    notes: topic.notes ? topic.notes.slice(0, NOTES_MAX) : null,
    difficulty: topic.difficulty,
    count: BATCH,
    avoid: prior.map((p) => p.stem)
  });
  if (!drafts.length) return { generated: 0, rejected: 0, reason: "model returned nothing usable" };

  const vectors = await embed(env, drafts.map((d) => d.stem)).catch(() => []);
  const threshold = parseFloat(env.DEDUP_DISTANCE || "0.12");
  const hashes = await Promise.all(drafts.map((d) => stemHash(d.stem)));

  // Free plan allows 50 external subrequests per invocation, so all the
  // duplicate checks go down one pipeline rather than one call each.
  const checks = [];
  drafts.forEach((d, i) => {
    checks.push([`SELECT 1 AS hit FROM questions WHERE stem_hash = ? LIMIT 1`, [hashes[i]]]);
    checks.push(
      vectors[i]
        ? [
            `SELECT MIN(vector_distance_cos(embedding, vector32(?))) AS d
               FROM questions WHERE syllabus_id = ? AND embedding IS NOT NULL`,
            [JSON.stringify(vectors[i]), topic.id]
          ]
        : [`SELECT NULL AS d`, []]
    );
  });
  const results = await db.batch(checks);

  const cosine = (a, b) => {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return 1 - dot; // both are unit length
  };

  const keep = [];
  let rejected = 0;

  for (let i = 0; i < drafts.length; i++) {
    const exact = results[i * 2].rows.length > 0;
    const near = results[i * 2 + 1].rows[0]?.d;
    const vec = vectors[i];

    if (exact || (near !== null && near !== undefined && near < threshold)) {
      rejected++;
      continue;
    }
    // Also against the rest of this batch, which the database has not seen yet.
    if (keep.some((k) => k.hash === hashes[i] || (vec && k.vec && cosine(vec, k.vec) < threshold))) {
      rejected++;
      continue;
    }
    keep.push({ draft: drafts[i], hash: hashes[i], vec });
  }

  if (keep.length) {
    await db.batch(
      keep.map(({ draft: d, hash, vec }) => [
        `INSERT INTO questions
           (syllabus_id, mode, stem, stem_hash, options, answer_index, explanation, difficulty, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${vec ? "vector32(?)" : "NULL"})`,
        [
          topic.id, topic.mode, d.stem, hash,
          JSON.stringify(d.options), d.answer_index, d.explanation,
          Math.min(3, Math.max(1, d.difficulty || 2)),
          ...(vec ? [JSON.stringify(vec)] : [])
        ]
      ])
    );
  }

  return { generated: keep.length, rejected, topic: topic.topic };
}

/* ------------------------------------------------------------------
 * Which topic to write about next, for this particular person.
 * Weak topics first; topics where they still have plenty unseen, last.
 * ---------------------------------------------------------------- */
async function pickTopicForUser(db, userId, mode) {
  const rows = await db.query(
    `SELECT s.id, s.mode, s.subject, s.unit, s.topic, s.notes, s.difficulty,
            ts.accuracy,
            (SELECT COUNT(*) FROM questions q
              WHERE q.syllabus_id = s.id AND q.flagged = 0
                AND NOT EXISTS (SELECT 1 FROM deliveries d
                                 WHERE d.user_id = ? AND d.question_id = q.id)) AS unseen
       FROM syllabus s
       LEFT JOIN topic_strength ts ON ts.syllabus_id = s.id AND ts.user_id = ?
      WHERE s.mode = ?
        AND (s.owner_id IS NULL OR s.owner_id = ?)
        AND NOT EXISTS (SELECT 1 FROM user_topic ut
                         WHERE ut.user_id = ? AND ut.syllabus_id = s.id AND ut.enabled = 0)`,
    [userId, userId, mode, userId, userId]
  );
  if (!rows.length) return null;

  const weighted = rows.map((r) => {
    const acc = r.accuracy === null ? 0.5 : r.accuracy;
    return { row: r, w: (1 - acc + 0.25) / (1 + (r.unseen || 0) * 1.5) };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let pick = Math.random() * total;
  for (const x of weighted) {
    pick -= x.w;
    if (pick <= 0) return x.row;
  }
  return weighted[weighted.length - 1].row;
}

async function unseenCount(db, userId, mode) {
  const r = await db.one(
    `SELECT COUNT(*) AS n
       FROM questions q
       JOIN syllabus s ON s.id = q.syllabus_id
      WHERE q.mode = ? AND q.flagged = 0
        AND (s.owner_id IS NULL OR s.owner_id = ?)
        AND NOT EXISTS (SELECT 1 FROM deliveries d
                         WHERE d.user_id = ? AND d.question_id = q.id)
        AND NOT EXISTS (SELECT 1 FROM user_topic ut
                         WHERE ut.user_id = ? AND ut.syllabus_id = s.id AND ut.enabled = 0)`,
    [mode, userId, userId, userId]
  );
  return r ? r.n : 0;
}

/* ------------------------------------------------------------------ */

async function initDatabase(db) {
  await db.batch([
    [`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, google_sub TEXT NOT NULL UNIQUE, email TEXT, name TEXT, mode TEXT NOT NULL DEFAULT 'jee', daily_cap INTEGER NOT NULL DEFAULT 40, suspended INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), last_seen INTEGER);`],
    [`CREATE TABLE IF NOT EXISTS usage_daily (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, generations INTEGER NOT NULL DEFAULT 0, served INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));`],
    [`CREATE TABLE IF NOT EXISTS syllabus (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE, mode TEXT NOT NULL, subject TEXT NOT NULL, unit TEXT, topic TEXT NOT NULL, notes TEXT, difficulty INTEGER NOT NULL DEFAULT 2, created_at INTEGER NOT NULL DEFAULT (unixepoch()));`],
    [`CREATE UNIQUE INDEX IF NOT EXISTS syllabus_public_idx ON syllabus (mode, subject, topic) WHERE owner_id IS NULL;`],
    [`CREATE UNIQUE INDEX IF NOT EXISTS syllabus_private_idx ON syllabus (owner_id, mode, subject, topic) WHERE owner_id IS NOT NULL;`],
    [`CREATE INDEX IF NOT EXISTS syllabus_mode_idx ON syllabus (mode);`],
    [`CREATE TABLE IF NOT EXISTS user_topic (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, syllabus_id INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE, enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, syllabus_id));`],
    [`CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, syllabus_id INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE, mode TEXT NOT NULL, stem TEXT NOT NULL, stem_hash TEXT NOT NULL UNIQUE, options TEXT NOT NULL, answer_index INTEGER NOT NULL, explanation TEXT NOT NULL, difficulty INTEGER NOT NULL DEFAULT 2, embedding F32_BLOB(768), flagged INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()));`],
    [`CREATE INDEX IF NOT EXISTS questions_topic_idx ON questions (syllabus_id, flagged);`],
    [`CREATE INDEX IF NOT EXISTS questions_mode_idx ON questions (mode, flagged);`],
    [`CREATE TABLE IF NOT EXISTS deliveries (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE, sent_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (user_id, question_id));`],
    [`CREATE INDEX IF NOT EXISTS deliveries_user_idx ON deliveries (user_id, sent_at);`],
    [`CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL, syllabus_id INTEGER NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE, chosen_index INTEGER, correct INTEGER NOT NULL, gate_kind TEXT, latency_ms INTEGER, device TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()));`],
    [`CREATE INDEX IF NOT EXISTS attempts_user_topic_idx ON attempts (user_id, syllabus_id);`],
    [`CREATE TABLE IF NOT EXISTS reports (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE, reason TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (user_id, question_id));`]
  ]);

  await db.batch([
    [`DROP VIEW IF EXISTS topic_strength;`],
    [`CREATE VIEW topic_strength AS SELECT a.user_id, s.id AS syllabus_id, s.mode, s.subject, s.topic, COUNT(a.id) AS attempts, COALESCE(SUM(a.correct), 0) AS correct, 1.0 * SUM(a.correct) / COUNT(a.id) AS accuracy, MAX(a.created_at) AS last_seen FROM attempts a JOIN syllabus s ON s.id = a.syllabus_id GROUP BY a.user_id, s.id;`]
  ]);

  const seed = [
    ['jee', 'Physics', 'Mechanics', 'Kinematics in one and two dimensions'],
    ['jee', 'Physics', 'Mechanics', "Newton's laws and friction"],
    ['jee', 'Physics', 'Mechanics', 'Work, energy and power'],
    ['jee', 'Physics', 'Electrodynamics', 'Electrostatics and Gauss\'s law'],
    ['jee', 'Physics', 'Electrodynamics', 'Current electricity and circuits'],
    ['jee', 'Chemistry', 'Physical', 'Mole concept and stoichiometry'],
    ['jee', 'Chemistry', 'Organic', 'General organic chemistry and isomerism'],
    ['jee', 'Mathematics', 'Algebra', 'Quadratic equations and inequalities'],
    ['jee', 'Mathematics', 'Calculus', 'Limits, continuity and differentiability'],
    ['neet', 'Physics', 'Mechanics', 'Kinematics and Motion'],
    ['neet', 'Chemistry', 'Organic', 'Basic Principles of Organic Chemistry'],
    ['neet', 'Biology', 'Botany', 'Cell: Structure and Functions'],
    ['neet', 'Biology', 'Zoology', 'Human Physiology: Digestion and Respiration']
  ];

  await db.batch(
    seed.map(([m, s, u, t]) => [
      `INSERT OR IGNORE INTO syllabus (mode, subject, unit, topic) VALUES (?, ?, ?, ?)`,
      [m, s, u, t]
    ])
  );
}

export default {
  /**
   * Cron. Grows the shared bank for public topics that are thin, so a new
   * user has thousands of questions waiting the moment they sign in. Also
   * keeps a free Turso database from being archived for inactivity.
   */
  async scheduled(event, env, ctx) {
    const db = new Turso(env.TURSO_URL, env.TURSO_TOKEN);
    const thin = await db.query(
      `SELECT s.id, s.mode, s.subject, s.unit, s.topic, s.notes, s.difficulty,
              COUNT(q.id) AS have
         FROM syllabus s
         LEFT JOIN questions q ON q.syllabus_id = s.id AND q.flagged = 0
        WHERE s.owner_id IS NULL
        GROUP BY s.id
       HAVING have < ?
        ORDER BY have ASC, RANDOM()
        LIMIT 3`,
      [BANK_TARGET]
    );
    for (const topic of thin) {
      await generateBatch(env, db, topic).catch(() => {});
    }
  },

  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/v1/health") return json({ ok: true });

    const db = new Turso(env.TURSO_URL, env.TURSO_TOKEN);

    if (path === "/v1/init-db") {
      await initDatabase(db);
      return json({ ok: true, message: "Database schema and seed topics initialized successfully" });
    }

    let user;
    try {
      user = await authenticate(request, env, db);
    } catch (err) {
      if (err.message && err.message.includes("no such table")) {
        await initDatabase(db);
        try {
          user = await authenticate(request, env, db);
        } catch (retryErr) {
          return json({ error: retryErr.message }, retryErr.status || 401);
        }
      } else {
        return json({ error: err.message }, err.status || 401);
      }
    }

    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

    try {
      /* ---- who am I -------------------------------------------- */
      if (path === "/v1/me" && request.method === "GET") {
        const used = await usage(db, user.id);
        return json({
          user: { email: user.email, name: user.name, mode: user.mode },
          quota: { used: used.generations, cap: user.daily_cap },
          unseen: await unseenCount(db, user.id, url.searchParams.get("mode") || user.mode)
        });
      }

      if (path === "/v1/me/mode" && request.method === "POST") {
        await db.run(`UPDATE users SET mode = ? WHERE id = ?`, [String(body.mode || "jee"), user.id]);
        return json({ ok: true });
      }

      if (path === "/v1/me" && request.method === "DELETE") {
        await db.run(`DELETE FROM users WHERE id = ?`, [user.id]);
        return json({ ok: true });
      }

      /* ---- serve questions ------------------------------------- */
      if (path === "/v1/questions/next" && request.method === "POST") {
        const mode = body.mode || user.mode;
        const want = Math.min(10, Math.max(1, body.count || 1));

        let unseen = await unseenCount(db, user.id, mode);

        if (unseen < want) {
          const used = await usage(db, user.id);
          if (used.generations >= user.daily_cap) {
            return json({ questions: [], error: "daily generation limit reached" }, 429);
          }
          const topic = await pickTopicForUser(db, user.id, mode);
          if (!topic) return json({ questions: [], error: "no topics enabled for this mode" }, 409);
          await generateBatch(env, db, topic);
          await bumpUsage(db, user.id, { generations: 1 });
          unseen = await unseenCount(db, user.id, mode);
        }

        const rows = await db.query(
          `SELECT q.id, q.stem, q.options, q.answer_index, q.explanation, q.difficulty,
                  s.subject, s.topic, s.id AS syllabus_id
             FROM questions q
             JOIN syllabus s ON s.id = q.syllabus_id
            WHERE q.mode = ? AND q.flagged = 0
              AND (s.owner_id IS NULL OR s.owner_id = ?)
              AND NOT EXISTS (SELECT 1 FROM deliveries d
                               WHERE d.user_id = ? AND d.question_id = q.id)
              AND NOT EXISTS (SELECT 1 FROM user_topic ut
                               WHERE ut.user_id = ? AND ut.syllabus_id = s.id AND ut.enabled = 0)
            ORDER BY RANDOM() LIMIT ?`,
          [mode, user.id, user.id, user.id, want]
        );

        if (rows.length) {
          await db.batch([
            [
              `INSERT OR IGNORE INTO deliveries (user_id, question_id) VALUES ${
                rows.map(() => "(?, ?)").join(", ")
              }`,
              rows.flatMap((r) => [user.id, r.id])
            ]
          ]);
          await bumpUsage(db, user.id, { served: rows.length });
        }

        // Keep growing the bank in the background, within quota.
        if (unseen - rows.length < UNSEEN_MIN) {
          ctx.waitUntil(
            (async () => {
              const used = await usage(db, user.id);
              if (used.generations >= user.daily_cap) return;
              const topic = await pickTopicForUser(db, user.id, mode);
              if (!topic) return;
              await generateBatch(env, db, topic);
              await bumpUsage(db, user.id, { generations: 1 });
            })().catch(() => {})
          );
        }

        return json({
          questions: rows.map((r) => ({
            id: r.id,
            syllabusId: r.syllabus_id,
            subject: r.subject,
            topic: r.topic,
            stem: r.stem,
            options: JSON.parse(r.options),
            answerIndex: r.answer_index,
            explanation: r.explanation,
            difficulty: r.difficulty
          })),
          unseen: unseen - rows.length
        });
      }

      /* ---- record an answer ------------------------------------ */
      if (path === "/v1/attempts" && request.method === "POST") {
        const q = await db.one(`SELECT syllabus_id FROM questions WHERE id = ?`, [body.questionId]);
        if (!q) return json({ error: "unknown question" }, 404);
        await db.run(
          `INSERT INTO attempts
             (user_id, question_id, syllabus_id, chosen_index, correct, gate_kind, latency_ms, device)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id, body.questionId, q.syllabus_id,
            body.chosen ?? null, body.correct ? 1 : 0,
            body.gate || null, body.latencyMs ?? null, body.device || "extension"
          ]
        );
        return json({ ok: true });
      }

      /* ---- report a bad question ------------------------------- */
      if (path === "/v1/report" && request.method === "POST") {
        await db.run(
          `INSERT OR IGNORE INTO reports (user_id, question_id, reason) VALUES (?, ?, ?)`,
          [user.id, body.questionId, (body.reason || "").slice(0, 200)]
        );
        // Three independent reports and it stops being served to anyone.
        await db.run(
          `UPDATE questions SET flagged = 1
            WHERE id = ?
              AND (SELECT COUNT(*) FROM reports WHERE question_id = ?) >= 3`,
          [body.questionId, body.questionId]
        );
        return json({ ok: true });
      }

      /* ---- syllabus -------------------------------------------- */
      if (path === "/v1/syllabus" && request.method === "GET") {
        const mode = url.searchParams.get("mode");
        const rows = await db.query(
          `SELECT s.id, s.mode, s.subject, s.unit, s.topic, s.notes, s.difficulty,
                  s.owner_id IS NOT NULL AS mine,
                  COALESCE(ut.enabled, 1) AS enabled,
                  ts.attempts, ts.accuracy,
                  (SELECT COUNT(*) FROM questions q
                    WHERE q.syllabus_id = s.id AND q.flagged = 0) AS bank,
                  (SELECT COUNT(*) FROM questions q
                    WHERE q.syllabus_id = s.id AND q.flagged = 0
                      AND NOT EXISTS (SELECT 1 FROM deliveries d
                                       WHERE d.user_id = ? AND d.question_id = q.id)) AS unseen
             FROM syllabus s
             LEFT JOIN user_topic ut ON ut.user_id = ? AND ut.syllabus_id = s.id
             LEFT JOIN topic_strength ts ON ts.user_id = ? AND ts.syllabus_id = s.id
            WHERE (s.owner_id IS NULL OR s.owner_id = ?) ${mode ? "AND s.mode = ?" : ""}
            ORDER BY s.subject, s.unit, s.topic`,
          mode ? [user.id, user.id, user.id, user.id, mode] : [user.id, user.id, user.id, user.id]
        );
        return json({ syllabus: rows });
      }

      if (path === "/v1/syllabus" && request.method === "POST") {
        // Turning a topic on or off is personal and works on public topics too.
        if (body.toggle) {
          await db.run(
            `INSERT INTO user_topic (user_id, syllabus_id, enabled)
             VALUES (?, ?, ?)
             ON CONFLICT (user_id, syllabus_id) DO UPDATE SET enabled = excluded.enabled`,
            [user.id, body.toggle, body.enabled ? 1 : 0]
          );
          return json({ ok: true });
        }

        // Editing and deleting only ever touches your own topics.
        if (body.delete) {
          const owned = await db.one(`SELECT id FROM syllabus WHERE id = ? AND owner_id = ?`, [body.delete, user.id]);
          if (!owned) return json({ error: "that topic is not yours to delete" }, 403);
          await db.run(`DELETE FROM syllabus WHERE id = ?`, [body.delete]);
          return json({ ok: true });
        }

        if (!body.mode || !body.subject || !body.topic) {
          return json({ error: "mode, subject and topic are required" }, 400);
        }
        if (["jee", "neet"].includes(String(body.mode).trim().toLowerCase())) {
          return json({ error: "jee and neet are shared; use your own mode name" }, 403);
        }
        await db.run(
          `INSERT INTO syllabus (owner_id, mode, subject, unit, topic, notes, difficulty)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (owner_id, mode, subject, topic) DO UPDATE SET
             unit = excluded.unit, notes = excluded.notes, difficulty = excluded.difficulty`,
          [
            user.id,
            String(body.mode).trim().toLowerCase().slice(0, 40),
            String(body.subject).trim().slice(0, 80),
            body.unit ? String(body.unit).trim().slice(0, 80) : null,
            String(body.topic).trim().slice(0, 120),
            body.notes ? String(body.notes).trim().slice(0, NOTES_MAX) : null,
            Math.min(3, Math.max(1, body.difficulty || 2))
          ]
        );
        return json({ ok: true });
      }

      if (path === "/v1/modes" && request.method === "GET") {
        const rows = await db.query(
          `SELECT mode, COUNT(*) AS topics, owner_id IS NOT NULL AS mine
             FROM syllabus
            WHERE owner_id IS NULL OR owner_id = ?
            GROUP BY mode, mine ORDER BY mine, mode`,
          [user.id]
        );
        return json({ modes: rows });
      }

      /* ---- stats ----------------------------------------------- */
      if (path === "/v1/stats" && request.method === "GET") {
        const mode = url.searchParams.get("mode") || user.mode;
        const [overall] = await db.query(
          `SELECT COUNT(*) AS answered, COALESCE(SUM(a.correct), 0) AS correct
             FROM attempts a JOIN syllabus s ON s.id = a.syllabus_id
            WHERE a.user_id = ? AND s.mode = ?`,
          [user.id, mode]
        );
        const weakest = await db.query(
          `SELECT subject, topic, attempts, correct, accuracy
             FROM topic_strength
            WHERE user_id = ? AND mode = ? AND attempts > 0
            ORDER BY accuracy ASC, attempts DESC LIMIT 20`,
          [user.id, mode]
        );
        return json({ overall, weakest });
      }

      /* ---- manual top-up --------------------------------------- */
      if (path === "/v1/topup" && request.method === "POST") {
        const mode = body.mode || user.mode;
        const used = await usage(db, user.id);
        // Each round costs ~6 external subrequests; the free plan allows 50.
        const rounds = Math.min(4, Math.max(1, body.rounds || 1), user.daily_cap - used.generations);
        if (rounds < 1) return json({ error: "daily generation limit reached" }, 429);

        const results = [];
        for (let i = 0; i < rounds; i++) {
          const topic = await pickTopicForUser(db, user.id, mode);
          if (!topic) break;
          results.push(await generateBatch(env, db, topic));
        }
        await bumpUsage(db, user.id, { generations: results.length });
        return json({ results, unseen: await unseenCount(db, user.id, mode) });
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }
  }
};
