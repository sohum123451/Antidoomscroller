const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

let settings = {};

function save() {
  chrome.runtime.sendMessage({ type: "saveSettings", settings });
}

function bindCheck(id, key) {
  $(id).addEventListener("change", () => { settings[key] = $(id).checked; save(); });
}

function bindNumber(id, key, scale = 1) {
  $(id).addEventListener("change", () => {
    const v = parseFloat($(id).value);
    if (!isNaN(v)) { settings[key] = Math.round(v * scale); save(); }
  });
}

function bindText(id, key) {
  $(id).addEventListener("change", () => { settings[key] = $(id).value.trim(); save(); });
}

function status(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

async function refreshAuthUI() {
  const res = await send({ type: "getMe" });
  if (res && res.signedIn && res.me && res.me.user) {
    $("authSignedOut").style.display = "none";
    $("authSignedIn").style.display = "block";
    $("userEmail").textContent = res.me.user.email || res.me.user.name || "Signed In";
    if (res.me.quota) {
      $("quotaInfo").textContent = `Generations today: ${res.me.quota.used} / ${res.me.quota.cap}`;
    }
  } else {
    $("authSignedOut").style.display = "block";
    $("authSignedIn").style.display = "none";
  }
}

async function loadModes() {
  const sel = $("mode");
  sel.innerHTML = "";
  const res = await send({ type: "listModes" });
  const modes = res && res.modes ? res.modes : [];

  const defaults = ["jee", "neet"];
  const modeList = modes.length
    ? modes.map((m) => m.mode)
    : Array.from(new Set([settings.mode || "jee", ...defaults]));

  modeList.forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m.toUpperCase();
    sel.appendChild(o);
  });
  if (modeList.includes(settings.mode)) {
    sel.value = settings.mode;
  }
}

function paintStats({ local, server }) {
  $("s-answered").textContent = local.answered;
  $("s-accuracy").textContent = local.answered
    ? Math.round((local.correct / local.answered) * 100) + "%"
    : "—";
  $("s-streak").textContent = local.bestStreak;

  const weak = $("weak");
  weak.innerHTML = "";
  const rows = (server && server.weakest ? server.weakest : []).slice(0, 4);
  if (!rows.length) return;
  const head = document.createElement("h2");
  head.textContent = "Weakest topics";
  weak.appendChild(head);
  rows.forEach((r) => {
    const line = document.createElement("div");
    const name = document.createElement("b");
    name.style.fontWeight = "400";
    name.textContent = r.topic;
    const pct = document.createElement("span");
    pct.textContent = Math.round(r.accuracy * 100) + "% of " + r.attempts;
    line.append(name, pct);
    weak.appendChild(line);
  });
}

(async function init() {
  const res = await send({ type: "getSettings" });
  settings = res.settings;

  $("enabled").checked = settings.enabled;
  $("reelsPerQuestion").value = settings.reelsPerQuestion;
  $("chatMinutes").value = settings.chatMinutes;
  $("answerDelaySec").value = (settings.answerDelayMs / 1000).toFixed(1);
  $("requireNewOnWrong").checked = settings.requireNewOnWrong;
  $("apiUrl").value = settings.apiUrl || "https://checkpoint-api.sohum123451.workers.dev";

  bindCheck("enabled", "enabled");
  bindCheck("requireNewOnWrong", "requireNewOnWrong");
  bindNumber("reelsPerQuestion", "reelsPerQuestion");
  bindNumber("chatMinutes", "chatMinutes");
  bindNumber("answerDelaySec", "answerDelayMs", 1000);
  bindText("apiUrl", "apiUrl");

  $("signIn").addEventListener("click", async () => {
    status("Signing in with Google…");
    const out = await send({ type: "signIn" });
    if (out && out.ok) {
      status("Signed in!", "good");
      await refreshAuthUI();
      await loadModes();
    } else {
      status(out ? out.error : "Sign in failed.", "bad");
    }
  });

  $("signOut").addEventListener("click", async () => {
    await send({ type: "signOut" });
    status("Signed out.", "good");
    await refreshAuthUI();
  });

  $("mode").addEventListener("change", () => {
    settings.mode = $("mode").value;
    save();
    status("Mode changed. Fetching fresh questions…");
  });

  await refreshAuthUI();

  if (!res.connected) {
    status("Not connected. Sign in with Google to sync with the server.");
  } else {
    const stale = res.lastSync && !res.lastSync.ok;
    status(
      stale
        ? `Last sync failed: ${res.lastSync.error}`
        : `${res.buffered} questions ready on this device` +
          (res.lastSync && res.lastSync.unseen !== null ? `, ${res.lastSync.unseen} unseen on server` : ""),
      stale ? "bad" : "good"
    );
  }

  $("check").addEventListener("click", async () => {
    status("Checking connection…");
    const out = await send({ type: "testConnection" });
    if (out && out.ok) {
      status("Connected.", "good");
      await loadModes();
      await refreshAuthUI();
    } else {
      status(out ? out.error : "No response from the worker.", "bad");
    }
  });

  $("syllabus").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("reset").addEventListener("click", async () => paintStats(await send({ type: "resetStats" })));

  await loadModes();
  paintStats(await send({ type: "getStats" }));
})();
