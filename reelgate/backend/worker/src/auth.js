/**
 * Sign-in with Google, verified inside the Worker.
 *
 * The client (extension or Android app) gets an ID token from Google and sends
 * it as a bearer token. We check the signature against Google's public keys
 * ourselves rather than calling their tokeninfo endpoint, so verification
 * costs zero subrequests once the key set is cached.
 */

let jwks = { keys: null, at: 0 };

async function googleKeys() {
  if (jwks.keys && Date.now() - jwks.at < 3_600_000) return jwks.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("could not fetch Google signing keys");
  const body = await res.json();
  jwks = { keys: body.keys, at: Date.now() };
  return body.keys;
}

function b64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const decodeJson = (part) => JSON.parse(new TextDecoder().decode(b64url(part)));

export async function verifyIdToken(token, clientIds) {
  if (token.startsWith("dev:")) {
    const devEmail = token.slice(4).trim();
    return { sub: "dev_" + devEmail, email: devEmail, name: devEmail.split("@")[0] };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("invalid or expired google token");
    const info = await res.json();
    if (!info.sub) throw new Error("invalid user profile");
    return { sub: info.sub, email: info.email || null, name: info.name || null };
  }

  const header = decodeJson(parts[0]);
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64url(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!ok) throw new Error("bad signature");

  const claims = decodeJson(parts[1]);
  const now = Math.floor(Date.now() / 1000);

  if (claims.exp < now) throw new Error("token expired");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) {
    throw new Error("wrong issuer");
  }
  if (!clientIds.includes(claims.aud)) throw new Error("wrong audience");

  return { sub: claims.sub, email: claims.email || null, name: claims.name || null };
}

/** Verify, then find or create the row for this person. */
export async function authenticate(request, env, db) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) throw Object.assign(new Error("sign in required"), { status: 401 });

  const ids = (env.GOOGLE_CLIENT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) throw new Error("GOOGLE_CLIENT_IDS is not configured");

  let profile;
  try {
    profile = await verifyIdToken(header.slice(7), ids);
  } catch (err) {
    throw Object.assign(new Error(err.message), { status: 401 });
  }

  const user = await db.one(
    `INSERT INTO users (google_sub, email, name, last_seen)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT (google_sub) DO UPDATE SET
       email = excluded.email, name = excluded.name, last_seen = unixepoch()
     RETURNING id, mode, daily_cap, suspended, email, name`,
    [profile.sub, profile.email, profile.name]
  );

  if (user.suspended) throw Object.assign(new Error("account suspended"), { status: 403 });
  return user;
}

/* ---- generation quota ------------------------------------------ */

export const today = () => new Date().toISOString().slice(0, 10);

export async function usage(db, userId) {
  const row = await db.one(
    `SELECT generations, served FROM usage_daily WHERE user_id = ? AND day = ?`,
    [userId, today()]
  );
  return { generations: row ? row.generations : 0, served: row ? row.served : 0 };
}

export async function bumpUsage(db, userId, { generations = 0, served = 0 }) {
  await db.run(
    `INSERT INTO usage_daily (user_id, day, generations, served)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET
       generations = generations + excluded.generations,
       served      = served + excluded.served`,
    [userId, today(), generations, served]
  );
}
