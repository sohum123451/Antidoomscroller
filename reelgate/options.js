const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

let currentMode = "jee";

function status(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

async function loadModes() {
  const sel = $("modeFilter");
  const res = await send({ type: "listModes" });
  const modes = res && res.modes ? res.modes : [];
  sel.innerHTML = "";

  const list = modes.length
    ? modes
    : [{ mode: "jee", topics: 60 }, { mode: "neet", topics: 62 }];

  list.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.mode;
    o.textContent = `${m.mode.toUpperCase()} (${m.topics} topics)`;
    sel.appendChild(o);
  });
  if (list.some((m) => m.mode === currentMode)) {
    sel.value = currentMode;
  }
  return true;
}

function topicRow(row) {
  const isEnabled = Boolean(row.enabled);
  const el = document.createElement("div");
  el.className = "topic" + (isEnabled ? "" : " off");

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = isEnabled;
  toggle.title = "Include this topic";
  toggle.addEventListener("change", async () => {
    await send({ type: "saveSyllabus", entry: { toggle: row.id, enabled: toggle.checked ? 1 : 0 } });
    render();
  });

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = row.topic;
  if (row.unit || row.notes) {
    const u = document.createElement("span");
    u.className = "unit";
    u.textContent = (row.unit ? row.unit : "") + (row.notes ? " · " + row.notes : "");
    name.appendChild(u);
  }

  const num = document.createElement("span");
  num.className = "num";
  const acc = row.accuracy === null ? null : Math.round(row.accuracy * 100);
  num.textContent =
    `${row.bank || 0} in bank` + (row.attempts ? ` · ${acc}% of ${row.attempts}` : "");

  if (row.mine) {
    const del = document.createElement("button");
    del.className = "link";
    del.textContent = "remove";
    del.addEventListener("click", async () => {
      if (!confirm(`Remove "${row.topic}"? Its questions and history go too.`)) return;
      await send({ type: "saveSyllabus", entry: { delete: row.id } });
      render();
    });
    el.append(toggle, name, num, del);
  } else {
    el.append(toggle, name, num);
  }

  return el;
}

async function render() {
  const list = $("list");
  const res = await send({ type: "listSyllabus", mode: currentMode });

  if (!res || res.error) {
    list.innerHTML = "";
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = res && res.error
      ? "Can't load the syllabus: " + res.error
      : "Please sign in with Google in the extension popup first.";
    list.appendChild(p);
    return;
  }

  const rows = res.syllabus || [];
  list.innerHTML = "";
  if (!rows.length) {
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = "Nothing in this mode yet. Add a topic above.";
    list.appendChild(p);
    return;
  }

  const bySubject = {};
  rows.forEach((r) => (bySubject[r.subject] = bySubject[r.subject] || []).push(r));

  Object.keys(bySubject).sort().forEach((subject) => {
    const sec = document.createElement("section");
    sec.className = "subject";
    const h = document.createElement("h3");
    const on = bySubject[subject].filter((r) => r.enabled).length;
    h.textContent = `${subject} — ${on} of ${bySubject[subject].length} on`;
    sec.appendChild(h);
    bySubject[subject].forEach((r) => sec.appendChild(topicRow(r)));
    list.appendChild(sec);
  });
}

(async function init() {
  const res = await send({ type: "getSettings" });
  currentMode = res.settings.mode || "jee";
  $("f-mode").value = currentMode;

  const ok = await loadModes();
  await render();
  if (ok) status("");

  $("modeFilter").addEventListener("change", async () => {
    currentMode = $("modeFilter").value;
    $("f-mode").value = currentMode;
    await render();
  });

  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const entry = {
      mode: $("f-mode").value.trim().toLowerCase(),
      subject: $("f-subject").value.trim(),
      unit: $("f-unit").value.trim(),
      topic: $("f-topic").value.trim(),
      notes: $("f-notes").value.trim(),
      difficulty: Number($("f-difficulty").value)
    };
    if (!entry.mode || !entry.subject || !entry.topic) return;
    const out = await send({ type: "saveSyllabus", entry });
    if (out && out.error) return status(out.error, "bad");
    $("f-topic").value = "";
    $("f-notes").value = "";
    currentMode = entry.mode;
    await loadModes();
    $("modeFilter").value = currentMode;
    await render();
    status(`Added ${entry.topic}.`, "good");
  });

  $("generate").addEventListener("click", async () => {
    status("Writing questions…");
    const out = await send({ type: "topup", mode: currentMode, rounds: 2 });
    if (!out || out.error) return status(out ? out.error : "Generation failed.", "bad");
    const made = out.results ? out.results.reduce((n, r) => n + (r.generated || 0), 0) : 0;
    const dropped = out.results ? out.results.reduce((n, r) => n + (r.rejected || 0), 0) : 0;
    status(`${made} new, ${dropped} rejected as duplicates. ${out.unseen ?? 0} unseen on server.`, "good");
    await render();
  });

  $("deleteAccount").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete your account and all personal study data? This cannot be undone.")) return;
    const out = await send({ type: "deleteAccount" });
    if (out && out.ok) {
      alert("Your account and data have been deleted.");
      window.location.reload();
    } else {
      alert("Failed to delete account: " + (out ? out.error : "Unknown error"));
    }
  });
})();
