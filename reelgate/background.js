importScripts("questions.js"); // offline fallback bank only

const DEFAULTS = {
  enabled: true,
  reelsPerQuestion: 1,
  chatMinutes: 5,
  answerDelayMs: 1200,
  requireNewOnWrong: true,
  apiUrl: "https://checkpoint-api.sohum123451.workers.dev",
  mode: "jee",
  bufferTarget: 8,       // questions kept locally so a gate never waits on the network
  topics: null           // offline bank only
};

const DEFAULT_STATS = { answered: 0, correct: 0, gatesShown: 0, streak: 0, bestStreak: 0, byTopic: {} };

/* ---------------- settings & tokens ---------------- */

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = Object.assign({}, DEFAULTS, settings || {});
  if (!s.apiUrl || s.apiUrl.includes("you.workers.dev")) {
    s.apiUrl = DEFAULTS.apiUrl;
  }
  if (!s.topics || !s.topics.length) s.topics = Object.keys(QUESTION_BANK);
  s.topics = s.topics.filter((t) => QUESTION_BANK[t]);
  if (!s.topics.length) s.topics = Object.keys(QUESTION_BANK);
  return s;
}

async function getToken(interactive = false) {
  // Check local cache first
  const { authToken, tokenExpiry } = await chrome.storage.local.get(["authToken", "tokenExpiry"]);
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return { token: authToken, error: null };
  }

  const chromeToken = await new Promise((resolve) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          resolve({ token: null, error: lastErr.message });
        } else {
          resolve({ token, error: null });
        }
      });
    } catch (e) {
      resolve({ token: null, error: e.message });
    }
  });

  if (chromeToken.token) {
    await chrome.storage.local.set({ authToken: chromeToken.token, tokenExpiry: Date.now() + 50 * 60 * 1000 });
    return { token: chromeToken.token, error: null };
  }

  // If chrome.identity.getAuthToken failed (e.g. unpacked extension / missing client ID registration), fall back to launchWebAuthFlow
  if (chromeToken.error && interactive) {
    const webAuth = await launchWebAuthFlow(interactive);
    if (webAuth.token) {
      await chrome.storage.local.set({ authToken: webAuth.token, tokenExpiry: Date.now() + 50 * 60 * 1000 });
    }
    return webAuth;
  }

  return chromeToken;
}

let authPromise = null;

async function launchWebAuthFlow(interactive = false) {
  if (authPromise) return authPromise;

  authPromise = (async () => {
    const clientId = "26126776554-7qnf73gi14tes8od19jr2su54khdm774.apps.googleusercontent.com";
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20email%20profile`;

    return new Promise((resolve) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Sign in cancelled";
          resolve({ token: null, error: err.includes("Only one web auth flow") ? "A Google sign-in window is already open. Please close it and try again." : err });
        } else {
          try {
            const hash = new URL(responseUrl).hash.substring(1);
            const params = new URLSearchParams(hash);
            const idToken = params.get("id_token") || params.get("access_token");
            if (idToken) {
              resolve({ token: idToken, error: null });
            } else {
              resolve({ token: null, error: "No token returned" });
            }
          } catch (err) {
            resolve({ token: null, error: String(err.message) });
          }
        }
      });
    });
  })();

  try {
    return await authPromise;
  } finally {
    authPromise = null;
  }
}

async function removeToken(token) {
  await chrome.storage.local.remove(["authToken", "tokenExpiry"]);
  if (!token) return;
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function isOnline(settings) {
  if (!settings.apiUrl) return false;
  const { token } = await getToken(false);
  return Boolean(token);
}

async function api(settings, path, { method = "GET", body, retry = true, token: explicitToken } = {}) {
  let token = explicitToken;
  let error = null;
  if (!token) {
    const res = await getToken(retry);
    token = res.token;
    error = res.error;
  }
  if (!token) throw new Error(error || "Not signed in with Google");

  const res = await fetch(settings.apiUrl.replace(/\/+$/, "") + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401 && retry) {
    await removeToken(token);
    const newToken = await getToken(true);
    if (newToken.token) {
      return api(settings, path, { method, body, retry: false, token: newToken.token });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------------- local buffer ---------------- */

async function readBuffer() {
  const { buffer } = await chrome.storage.local.get("buffer");
  return Array.isArray(buffer) ? buffer : [];
}

async function writeBuffer(buffer) {
  await chrome.storage.local.set({ buffer });
}

async function fillBuffer(settings, want) {
  if (!settings.apiUrl) return [];
  const data = await api(settings, "/v1/questions/next", {
    method: "POST",
    body: { mode: settings.mode, count: want }
  });
  const incoming = (data.questions || []).map((q) => ({
    id: "srv:" + q.id,
    serverId: q.id,
    topic: q.topic,
    label: `${q.subject} · ${q.topic}`,
    q: q.stem,
    rawOpts: q.options,
    rawAnswer: q.answerIndex,
    why: q.explanation
  }));
  if (incoming.length) {
    const buffer = (await readBuffer()).concat(incoming);
    await writeBuffer(buffer);
  }
  await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: true, unseen: data.unseen ?? null } });
  return incoming;
}

async function topUp() {
  const settings = await getSettings();
  if (!settings.apiUrl) return;
  const { token } = await getToken(false);
  if (!token) return;

  const buffer = await readBuffer();
  const gap = settings.bufferTarget - buffer.length;
  if (gap <= 0) return;
  try {
    await fillBuffer(settings, Math.min(10, gap));
  } catch (err) {
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: false, error: String(err.message) } });
  }
}

chrome.alarms.create("checkpoint-topup", { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "checkpoint-topup") topUp();
});
chrome.runtime.onStartup.addListener(topUp);
chrome.runtime.onInstalled.addListener(topUp);

/* ---------------- serving ---------------- */

function shuffled(opts, answer) {
  const order = opts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { opts: order.map((i) => opts[i]), a: order.indexOf(answer) };
}

async function localQuestion(settings) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  const mode = (settings.mode || "jee").toLowerCase();
  const pool = [];

  for (const topicKey of Object.keys(QUESTION_BANK)) {
    const t = QUESTION_BANK[topicKey];
    if (!t.mode || t.mode === mode) {
      t.questions.forEach((q, i) =>
        pool.push({ id: `local:${topicKey}:${i}`, topic: topicKey, label: t.label, ...q })
      );
    }
  }

  const listToUse = pool.length ? pool : Object.keys(QUESTION_BANK).flatMap((topicKey) =>
    QUESTION_BANK[topicKey].questions.map((q, i) => ({
      id: `local:${topicKey}:${i}`, topic: topicKey, label: QUESTION_BANK[topicKey].label, ...q
    }))
  );

  if (!listToUse.length) return null;
  const cooldown = Math.floor(listToUse.length / 3);
  const fresh = listToUse.filter((q) => !recent.slice(-cooldown).includes(q.id));
  const list = fresh.length ? fresh : listToUse;
  const pick = list[Math.floor(Math.random() * list.length)];
  await chrome.storage.local.set({ recent: recent.concat(pick.id).slice(-Math.max(cooldown, 1)) });
  const { opts, a } = shuffled(pick.opts, pick.a);
  return { id: pick.id, topic: pick.topic, label: pick.label, q: pick.q, opts, a, why: pick.why, offline: true };
}

async function pickQuestion() {
  const settings = await getSettings();
  let buffer = await readBuffer();

  const { token } = await getToken(false);
  if (settings.apiUrl && token && !buffer.length) {
    try {
      await fillBuffer(settings, settings.bufferTarget);
      buffer = await readBuffer();
    } catch (err) {
      await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: false, error: String(err.message) } });
    }
  }

  if (buffer.length) {
    const item = buffer.shift();
    await writeBuffer(buffer);
    if (buffer.length < Math.ceil(settings.bufferTarget / 2)) topUp();
    const { opts, a } = shuffled(item.rawOpts, item.rawAnswer);
    return {
      id: item.id, serverId: item.serverId, topic: item.topic, label: item.label,
      q: item.q, opts, a, why: item.why, settings
    };
  }

  // Fallback to offline bank
  const local = await localQuestion(settings);
  return local ? Object.assign(local, { settings }) : null;
}

/* ---------------- stats ---------------- */

async function recordAnswer(msg) {
  const settings = await getSettings();
  const { stats } = await chrome.storage.local.get("stats");
  const s = Object.assign({}, DEFAULT_STATS, stats || {});
  if (msg.gate) s.gatesShown += 1;
  s.answered += 1;
  if (msg.correct) {
    s.correct += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.streak = 0;
  }
  const t = s.byTopic[msg.topic] || { answered: 0, correct: 0 };
  t.answered += 1;
  if (msg.correct) t.correct += 1;
  s.byTopic[msg.topic] = t;
  await chrome.storage.local.set({ stats: s });

  const { token } = await getToken(false);
  if (msg.serverId && settings.apiUrl && token) {
    api(settings, "/v1/attempts", {
      method: "POST",
      body: {
        questionId: msg.serverId,
        chosen: msg.chosen,
        correct: Boolean(msg.correct),
        gate: msg.gateKind,
        latencyMs: msg.latencyMs,
        device: "extension"
      }
    }).catch(() => {});
  }
  return s;
}

/* ---------------- message listener ---------------- */

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    const settings = await getSettings();
    try {
      switch (msg.type) {
        case "signIn": {
          if (!settings.apiUrl || settings.apiUrl.includes("you.workers.dev")) {
            throw new Error("Please enter your deployed Cloudflare Worker URL first.");
          }
          const { token, error } = await getToken(true);
          if (!token) throw new Error(error || "Sign in failed or was cancelled.");
          const me = await api(settings, "/v1/me", { retry: false, token });
          if (me && me.user && me.user.mode) {
            settings.mode = me.user.mode;
            await chrome.storage.local.set({ settings });
          }
          await writeBuffer([]);
          await topUp();
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach((t) => {
              chrome.tabs.sendMessage(t.id, { type: "signedIn" }).catch(() => {});
            });
          });
          respond({ ok: true, me });
          break;
        }

        case "signInWithEmail": {
          const email = (msg.email || "").trim();
          if (!email || !email.includes("@")) throw new Error("Please enter a valid email address.");
          const devToken = "dev:" + email;
          await chrome.storage.local.set({ authToken: devToken, tokenExpiry: Date.now() + 30 * 24 * 60 * 60 * 1000 });
          const me = await api(settings, "/v1/me", { retry: false, token: devToken });
          if (me && me.user && me.user.mode) {
            settings.mode = me.user.mode;
            await chrome.storage.local.set({ settings });
          }
          await writeBuffer([]);
          await topUp();
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach((t) => {
              chrome.tabs.sendMessage(t.id, { type: "signedIn" }).catch(() => {});
            });
          });
          respond({ ok: true, me });
          break;
        }

        case "signOut": {
          const { token } = await getToken(false);
          if (token) await removeToken(token);
          await writeBuffer([]);
          respond({ ok: true });
          break;
        }

        case "getMe": {
          const { token } = await getToken(false);
          if (!token || !settings.apiUrl || settings.apiUrl.includes("you.workers.dev")) {
            respond({ signedIn: false });
            break;
          }
          const me = await api(settings, `/v1/me?mode=${encodeURIComponent(settings.mode)}`).catch(() => null);
          respond({ signedIn: Boolean(me), me });
          break;
        }

        case "getQuestion":
          respond(await pickQuestion());
          break;

        case "getSettings": {
          const { token } = await getToken(false);
          const { lastSync } = await chrome.storage.local.get("lastSync");
          respond({
            settings,
            signedIn: Boolean(token),
            connected: Boolean(token && settings.apiUrl),
            buffered: (await readBuffer()).length,
            lastSync: lastSync || null,
            offlineTopics: Object.keys(QUESTION_BANK).map((k) => ({
              key: k,
              label: QUESTION_BANK[k].label,
              count: QUESTION_BANK[k].questions.length
            }))
          });
          break;
        }

        case "saveSettings": {
          const prev = settings;
          await chrome.storage.local.set({ settings: msg.settings });
          const next = await getSettings();
          if (next.mode !== prev.mode || next.apiUrl !== prev.apiUrl) {
            await writeBuffer([]);
            topUp();
          }
          respond(next);
          break;
        }

        case "recordAnswer":
          respond(await recordAnswer(msg));
          break;

        case "reportQuestion": {
          respond(await api(settings, "/v1/report", {
            method: "POST",
            body: { questionId: msg.questionId, reason: msg.reason || "Reported by user" }
          }));
          break;
        }

        case "deleteAccount": {
          await api(settings, "/v1/me", { method: "DELETE" });
          const { token } = await getToken(false);
          if (token) await removeToken(token);
          await writeBuffer([]);
          respond({ ok: true });
          break;
        }

        case "getStats": {
          const { stats } = await chrome.storage.local.get("stats");
          const local = Object.assign({}, DEFAULT_STATS, stats || {});
          let server = null;
          const { token } = await getToken(false);
          if (settings.apiUrl && token) {
            server = await api(settings, `/v1/stats?mode=${encodeURIComponent(settings.mode)}`).catch(() => null);
          }
          respond({ local, server });
          break;
        }

        case "resetStats":
          await chrome.storage.local.set({ stats: DEFAULT_STATS });
          respond({ local: DEFAULT_STATS, server: null });
          break;

        case "testConnection":
          try {
            const url = (settings.apiUrl || "").replace(/\/+$/, "");
            if (!url) throw new Error("Worker URL is not set");
            const res = await fetch(url + "/v1/status");
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              respond({ ok: true, data });
            } else {
              respond({ ok: false, error: `Server returned HTTP ${res.status}` });
            }
          } catch (err) {
            respond({ ok: false, error: String(err.message) });
          }
          break;

        case "listSyllabus":
          respond(await api(settings, `/v1/syllabus?mode=${encodeURIComponent(msg.mode || "")}`));
          break;

        case "listModes":
          respond(await api(settings, "/v1/modes"));
          break;

        case "saveSyllabus":
          respond(await api(settings, "/v1/syllabus", { method: "POST", body: msg.entry }));
          break;

        case "topup":
          respond(await api(settings, "/v1/topup", { method: "POST", body: { mode: msg.mode, rounds: msg.rounds || 2 } }));
          break;

        default:
          respond(null);
      }
    } catch (err) {
      respond({ error: String(err.message || err) });
    }
  })();
  return true;
});
