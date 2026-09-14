# Setup

Everything here runs on free tiers with no card. About 25 minutes end to end.

You need: a Turso account, a Google AI Studio key, a Cloudflare account, and
Node installed.

---

## 1. Database

```bash
npm install -g turso          # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup

turso db create checkpoint
turso db shell checkpoint < backend/schema.sql
turso db shell checkpoint < backend/seed-jee-neet.sql
```

Confirm it took:

```bash
turso db shell checkpoint "SELECT mode, COUNT(*) FROM syllabus GROUP BY mode"
# jee|61
# neet|61
```

Grab the two values you'll need:

```bash
turso db show checkpoint --url        # libsql://checkpoint-you.turso.io
turso db tokens create checkpoint     # long string
```

## 2. Gemini key

Create one at `aistudio.google.com/apikey`. Check which models it can reach —
IDs get retired regularly, and a dead one fails at generation time rather than
deploy time:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY" \
  | grep '"name"'
```

If `gemini-flash-lite-latest` isn't in that list, put whatever Flash alias is
into `GEMINI_MODEL` in `backend/worker/wrangler.toml`.

## 3. Worker

```bash
cd backend/worker
npx wrangler login

npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TURSO_URL          # the libsql:// URL from step 1
npx wrangler secret put TURSO_TOKEN
npx wrangler secret put DEVICE_TOKEN       # invent one:
                                           # openssl rand -hex 32

npx wrangler deploy
```

It prints your URL. Check it:

```bash
curl https://checkpoint-api.<you>.workers.dev/v1/health
# {"ok":true}
```

## 4. Fill the pool

Nothing exists yet — the first questions have to be written.

```bash
export URL=https://checkpoint-api.<you>.workers.dev
export TOK=<your DEVICE_TOKEN>

curl -X POST $URL/v1/topup -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" -d '{"mode":"jee","rounds":4}'
```

You'll get back how many were written and how many were rejected as duplicates.
Run it a few times to build up a cushion. From then on the cron handles it.

## 5. Extension

`chrome://extensions` → Developer mode on → Load unpacked → pick the project
folder (the one with `manifest.json`, not `backend`).

Open the popup, paste the Worker URL and device token, click **Check
connection**, pick your mode. Open YouTube Shorts.

---

# Is it actually free 24/7?

Yes, and importantly there's nothing to keep alive. This isn't a server that
sleeps after 15 idle minutes the way a free Render or Railway box does —
Workers spin up per request and the cron fires whether or not any of your
devices are on.

| | Free allowance | What you'll use at ~200 reels/day |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day | roughly 250 |
| Worker CPU | 10 ms per request | ~2 ms; waiting on Gemini and Turso doesn't count |
| Worker subrequests | 50 per invocation | ~6 per generation round |
| Cron triggers | 5 per account | 1 |
| Turso storage | 5 GB | a question with its embedding is ~4 KB |
| Turso row reads | 500M/month | low six figures |

**The one that will actually bind is Gemini.** At 200 gated reels a day you're
making around 35 generation calls and 35 embedding calls daily. Free-tier
request-per-day caps differ per model and Google changes them, so check yours
in AI Studio. If you start hitting it, raise `BATCH` in `worker/src/index.js`
so each call produces more questions, or drop `reelsPerQuestion` to 3.

Two things that can bite you later:

**Turso archives free databases after 10 idle days.** The two-hourly cron keeps
it warm on its own. If you do stop for a while, `turso group unarchive
<group>` brings it back with your data intact.

**Row reads grow with your history.** Picking a topic aggregates over the whole
`attempts` table. That's nothing at a few thousand rows; if you're still
running this in a year with a hundred thousand attempts, cache the per-topic
counts in a real table instead of the `topic_strength` view.

---

# Updating it

Three different things change at three different speeds.

## Syllabus — no deploy at all

Adding a topic, switching one off, editing a note: all of it goes through the
syllabus editor into the database. Nothing to redeploy, nothing to reload. This
is most of what you'll actually change.

## Worker — redeploy

```bash
cd backend/worker && npx wrangler deploy
```

Takes a few seconds and is atomic; there's no downtime window. Secrets survive
deploys, so you set them once.

To make it automatic, put the project in a GitHub repo — there's already a
workflow at `.github/workflows/deploy-worker.yml` that redeploys on any push
touching `backend/worker/`. It needs one repo secret:

1. Cloudflare dashboard → My Profile → API Tokens → Create Token → **Edit
   Cloudflare Workers** template.
2. GitHub repo → Settings → Secrets and variables → Actions → new secret named
   `CLOUDFLARE_API_TOKEN`.

Push to `main` and it deploys. Your Gemini and Turso secrets stay in Cloudflare
and never touch the repo.

**Add a `.gitignore` before your first commit:**

```
node_modules/
.dev.vars
.wrangler/
```

`.dev.vars` is where wrangler keeps local secrets. Committing it leaks your
Gemini key.

## Schema — migrate by hand

```bash
turso db shell checkpoint "ALTER TABLE questions ADD COLUMN source TEXT"
```

Back up first, it's one command:

```bash
turso db shell checkpoint .dump > backup-$(date +%F).sql
```

## Extension — reload

Edit the files, then hit the circular reload arrow on the Checkpoint card in
`chrome://extensions`. Content script changes also need the tab refreshed.

Unpacked extensions don't auto-update — that's the tradeoff for not going
through the Web Store. If you want it updating by itself across machines,
publishing costs a one-time $5 developer registration and then updates arrive
on their own. For one laptop, the reload button is fine.

---

# When something breaks

| Symptom | Cause |
|---|---|
| Popup says "Not connected" | URL or token wrong. The URL has no trailing slash and includes `https://`. |
| `curl /v1/health` works, extension doesn't | Token mismatch. `/v1/health` is the one route with no auth. |
| Top-up returns `generated: 0` | Either no active topics for that mode, or a bad `GEMINI_MODEL`. `npx wrangler tail` shows the real error. |
| Every generation is mostly rejected | That topic is exhausted. Split it into narrower topics. |
| Gates show old built-in questions | The Worker is unreachable and it fell back to `questions.js`. Check the popup status line. |
| `BLOCKED` from Turso | Monthly row quota hit. |
| Questions stop after a long break | Database archived. `turso group unarchive <group>`. |

`npx wrangler tail` streams live logs from the deployed Worker. It's the first
thing to reach for when generation misbehaves.
