# Checkpoint

A question stands between you and the next reel, and between you and another
five minutes of chat. Questions are written by Gemini against a syllabus you
control, stored in Turso, and never repeated.

```
extension / android app          Cloudflare Worker              Turso
  gate UI, local buffer   <-->   generate, dedup, serve   <-->   syllabus
  no secrets                     holds both secrets              questions
                                                                 attempts
```

The Worker exists so the Gemini key and Turso token never ship to a device.
It is also what lets the laptop and the phone share one question history, which
is the only way "don't repeat" can actually hold.

Full walkthrough, free-tier numbers and the update workflow are in
**[SETUP.md](SETUP.md)**. The short version:

---

## 1. Turso

```bash
turso db create checkpoint
turso db shell checkpoint < backend/schema.sql
turso db shell checkpoint < backend/seed-jee-neet.sql   # 122 JEE + NEET topics

turso db show checkpoint --url          # -> TURSO_URL
turso db tokens create checkpoint       # -> TURSO_TOKEN
```

## 2. Worker

```bash
cd backend/worker
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TURSO_URL
npx wrangler secret put TURSO_TOKEN
npx wrangler secret put DEVICE_TOKEN     # any long random string you invent
npx wrangler deploy
```

Check the model ID before you rely on it — Google retires them often:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | grep '"name"'
```

`GEMINI_MODEL` in `wrangler.toml` defaults to a `-latest` alias, which survives
version bumps. Move it to a stronger Flash or Pro alias if the questions come
out shallow; question quality is the whole product, so it's worth the cost.

A cron trigger (every two hours) refills the pool on its own, so questions are
waiting whether or not your laptop is open. It also keeps the free Turso
database from being archived for inactivity.

Warm the pool before first use:

```bash
curl -X POST https://checkpoint-api.<you>.workers.dev/v1/topup \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"jee","rounds":4}'
```

## 3. Extension

`chrome://extensions` → Developer mode → Load unpacked → this folder. Open the
popup, paste the Worker URL and device token, hit **Check connection**, pick a
mode.

---

## How questions stay fresh

**Never wait on the model.** The extension keeps eight questions in
`chrome.storage` and refills in the background every ten minutes and after
every gate. A gate renders instantly; Gemini's two seconds happen while you're
still watching the previous reel. If the pool ever empties, the Worker
generates inline and you wait — the alarm exists so that's rare.

**Three layers of dedup.**

1. The last 40 stems for that topic go into the prompt as things not to write.
2. A SHA-256 of the normalised stem rejects exact and whitespace-level repeats.
3. Every stem is embedded (`gemini-embedding-001`, 768 dims, renormalised) and
   compared against every existing question on that topic with
   `vector_distance_cos`. Anything under `DEDUP_DISTANCE` (0.12) is thrown away.
   This is what catches the reworded-same-question case that the prompt misses.

Rejected questions cost you a little quota and nothing else. Watch the reject
rate in the syllabus editor: if it climbs past roughly half, that topic is
exhausted and wants narrowing or splitting.

**Questions are served once.** `served_at` is stamped on handover, so nothing
you have seen comes back, on any device.

## How topics get chosen

Generation doesn't pick round-robin. Each topic's weight is
`(1 − accuracy + 0.25) ÷ (1 + 1.5 × questions already pooled)`. Topics you keep
getting wrong get written about more; topics already stocked get skipped until
the stock drains. A brand new topic is treated as 50% accuracy so it isn't
starved and isn't favoured.

## Modes and custom syllabi

`jee` and `neet` ship seeded. A mode is just a string — type a name that
doesn't exist in the syllabus editor and you've created one. Per topic you can
set difficulty and a free-text note that gets passed to the question writer:

> Stick to Nernst equation and cell EMF. No electrolysis numericals.

That note is the most useful field on the form. Use it to scope a topic down
to what your test actually covers.

## API

All routes need `Authorization: Bearer <DEVICE_TOKEN>`.

| Route | Does |
|---|---|
| `POST /v1/questions/next` | `{mode, count}` → unseen questions, marks them served |
| `POST /v1/attempts` | `{questionId, chosen, correct, gate, latencyMs, device}` |
| `GET /v1/syllabus?mode=` | topics with written counts and accuracy |
| `POST /v1/syllabus` | add/update, or `{delete: id}` / `{toggle: id}` |
| `GET /v1/modes` | modes and topic counts |
| `GET /v1/stats?mode=` | overall plus twenty weakest topics |
| `POST /v1/topup` | `{mode, rounds}` → generate now |
| `GET /v1/health` | no auth, for uptime checks |

The Android app talks to exactly these, so nothing here needs rewriting when
that lands.

## Where it works

| Site | Reels gated | Chat timed |
|---|---|---|
| YouTube Shorts | yes | — |
| Instagram Reels | yes | DMs |
| TikTok | yes | yes |
| Facebook Reels | yes | yes |
| WhatsApp Web, Messenger, Discord, Telegram Web, Snapchat | — | yes |

The chat timer only runs while the tab is visible **and** focused. Two minutes
away resets it.

## Getting out

No skip button. Switch the extension off in the popup — an open question closes
immediately.

## Known limits

- If the Worker is unreachable, the extension falls back to the small bank in
  `questions.js` rather than letting you scroll free. Edit that file if you want
  the fallback to be on your subjects too.
- The extension has no host permission for your Worker; it relies on the CORS
  headers the Worker sends. If fetches fail with a CORS error, add your Worker
  origin to `host_permissions` in `manifest.json`.
- Instagram sometimes reuses its URL between reels, so one can slip through.
- Fullscreen exits when a question appears — an overlay can't draw over a
  fullscreen video.
- One device token for everything. Fine for you; it is not multi-user auth.
