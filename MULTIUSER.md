# Going multi-user

v1 was a tool with one user: one `DEVICE_TOKEN`, one syllabus, `served_at`
stamped on the question row. v2 is the same product with the three assumptions
that break under a second person taken out.

## What changed

**Questions are a shared bank.** A question belongs to a topic, not a person.
Who has seen it lives in `deliveries`. This is the decision that determines
whether this is affordable: with per-user questions, your Gemini bill grows
with every signup. With a shared bank, a new user arrives to thousands of
questions that already exist and costs nothing to generate for. Cost tracks
your heaviest individual user, not headcount.

**Topic on/off became personal.** `syllabus.active` was global — one person
switching off Thermodynamics would switch it off for everyone. It now lives in
`user_topic`, and only exclusions are stored, so a new account writes no rows
until they turn something off.

**Syllabi are public or private.** `owner_id IS NULL` means public: `jee` and
`neet`, readable by everyone, editable by nobody through the API. Anything with
an owner is that person's custom test syllabus, visible only to them. Questions
generated for a private topic are only ever served back to its owner.

**Sign-in with Google.** The ID token is verified inside the Worker against
Google's public keys, cached for an hour, so it costs no subrequests in the
normal case. Users are created on first sight.

**Per-user daily generation cap.** `users.daily_cap`, default 40 rounds
(~240 questions) per day. Serving costs nothing against it; only generation
does. This is the thing standing between one enthusiastic user and your whole
Gemini quota.

**Reporting.** Three independent reports flag a question and it stops being
served to anyone. You did not write this content and a model will occasionally
produce a wrong answer key, so there has to be a way out that isn't you reading
every question.

## Setup changes

```bash
turso db shell <db> .dump > backup-before-v2.sql        # do this first
turso db shell <db> < backend/migrate-v1-to-v2.sql      # upgrading
# or, fresh:
turso db shell <db> < backend/schema-v2.sql
turso db shell <db> < backend/seed-jee-neet.sql
```

The migration keeps your questions, syllabus and history, attributing all of it
to user 1. After your first real sign-in, point that row at your actual Google
account so you keep your history:

```sql
UPDATE users SET google_sub = '<your sub from the ID token>' WHERE id = 1;
```

Then an OAuth client:

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client
   ID → **Chrome Extension**, with your extension's ID.
2. Put the client ID in `GOOGLE_CLIENT_IDS` in `wrangler.toml` (comma separated
   — the Android app gets its own, added later).
3. `npx wrangler deploy`.

`DEVICE_TOKEN` is no longer used. Delete the secret once v2 is live.

## Extension changes still to do

The extension currently sends a static token. It needs to send a Google ID
token instead:

- Add `"identity"` to `permissions` and an `oauth2` block with the client ID
  and the `openid email profile` scopes to `manifest.json`.
- Swap the token field in the popup for a Sign in with Google button calling
  `chrome.identity.getAuthToken`.
- ID tokens expire after an hour. Refresh on a 401 and retry once, rather than
  falling back to the offline bank — otherwise a routine expiry looks like an
  outage.

## Distribution

Unpacked extensions need developer mode, which no ordinary person will do. For
"anyone, anytime" you need the Chrome Web Store: $5 one-time developer
registration, then review, which is usually a few days and is slower for
anything requesting broad host permissions. You will be asked to justify every
permission in the listing — yours are `storage`, `alarms`, `identity`, and host
access to the reel and chat sites, all straightforwardly explainable.

You also need a privacy policy at a public URL. You are storing other people's
email addresses and a record of what they study, so this is a real document, not
a formality. Say what you collect, that answers go to Google's Gemini API, how
long you keep it, and how someone deletes their account. Add a delete endpoint
before you launch — `ON DELETE CASCADE` is already on every foreign key, so
removing the user row removes everything of theirs except the questions they
generated, which stay in the shared bank and belong to nobody.

## What this costs

Cloudflare and Turso free tiers stay comfortable for a long time — you are
nowhere near 100,000 requests a day or 5 GB.

Gemini is the binding constraint, and the shared bank is what keeps it sane.
The cron grows public topics toward 40 questions each in the background; at 122
seeded topics that is about 5,000 questions, built up over a few days of cron
runs and then serving every new user instantly for free. Generation only
happens when somebody exhausts their unseen set, which for a normal user is
weeks away.

Where it stops being free: enough simultaneous heavy users that generation runs
constantly. Watch `usage_daily`. When the daily sum of `generations` starts
approaching your model's free request-per-day cap, the options in order of
preference are raising `BATCH` so each call yields more questions, lowering
`daily_cap`, and then paying — which at Gemini Flash rates is cents per
thousand questions, not a crisis.

## Things worth doing before you let strangers in

- **Rate limit at the edge.** A Cloudflare rate limiting rule on
  `/v1/questions/next` and `/v1/topup` is free and stops a scripted client
  burning through a quota the app-level cap allows.
- **The notes field reaches the model.** It is capped at 300 characters and
  scoped so a user's own text only affects their own private topics, but it is
  still a text box wired to an LLM you pay for. Watch it.
- **Answer keys will sometimes be wrong.** Reporting handles this, but you
  should spot-check a sample of the bank yourself, especially on topics where
  reject rates are low and the model is confidently producing near-misses.
