(() => {
  if (window.__checkpointLoaded) return;
  window.__checkpointLoaded = true;

  /* ---------------------------------------------------------------
   * Site adapters
   * Each one answers: are we looking at a reel, and which reel is it?
   * ------------------------------------------------------------- */
  const ADAPTERS = {
    "youtube.com": {
      isReel: () => location.pathname.startsWith("/shorts/"),
      reelKey: () => location.pathname,
      isChat: () => false
    },
    "instagram.com": {
      isReel: () =>
        location.pathname.startsWith("/reels/") ||
        location.pathname.startsWith("/reel/"),
      reelKey: () => location.pathname,
      isChat: () => location.pathname.startsWith("/direct/")
    },
    "tiktok.com": {
      isReel: () =>
        location.pathname === "/" ||
        location.pathname.includes("/video/") ||
        location.pathname.startsWith("/foryou"),
      reelKey: () => location.pathname + (document.querySelector("video")?.currentSrc || ""),
      isChat: () => location.pathname.startsWith("/messages")
    },
    "facebook.com": {
      isReel: () => location.pathname.startsWith("/reel/"),
      reelKey: () => location.pathname,
      isChat: () => location.pathname.startsWith("/messages")
    },
    "messenger.com": { isReel: () => false, reelKey: () => "", isChat: () => true },
    "whatsapp.com": { isReel: () => false, reelKey: () => "", isChat: () => true },
    "discord.com": {
      isReel: () => false,
      reelKey: () => "",
      isChat: () => location.pathname.startsWith("/channels")
    },
    "telegram.org": { isReel: () => false, reelKey: () => "", isChat: () => true },
    "snapchat.com": { isReel: () => false, reelKey: () => "", isChat: () => true }
  };

  const host = location.hostname.replace(/^www\./, "");
  const adapterKey = Object.keys(ADAPTERS).find((k) => host === k || host.endsWith("." + k));
  if (!adapterKey) return;
  const site = ADAPTERS[adapterKey];

  /* --------------------------------------------------------------- */

  function safeSendMessage(msg, callback) {
    if (!chrome.runtime || !chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) return;
        if (callback) callback(response);
      });
    } catch (err) {
      // Extension context invalidated
    }
  }

  let settings = { enabled: true, reelsPerQuestion: 1, chatMinutes: 5, answerDelayMs: 1200, requireNewOnWrong: true };
  let gateOpen = false;
  let hostEl = null;
  let reelsSinceGate = 0;
  let lastReelKey = null;
  let chatSeconds = 0;
  let awayTicks = 0;
  let pauseTimer = null;
  let savedOverflow = "";

  safeSendMessage({ type: "getSettings" }, (res) => {
    if (res && res.settings) settings = res.settings;
  });

  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        if (!changes.settings) return;
        settings = Object.assign(settings, changes.settings.newValue || {});
        if (!settings.enabled && gateOpen) closeGate();
      });
    }
  } catch (err) {}

  /* ---- navigation watching --------------------------------------- */

  function announceNav() {
    window.dispatchEvent(new Event("checkpoint:nav"));
  }
  for (const fn of ["pushState", "replaceState"]) {
    const original = history[fn];
    history[fn] = function () {
      const out = original.apply(this, arguments);
      announceNav();
      return out;
    };
  }
  window.addEventListener("popstate", announceNav);
  window.addEventListener("checkpoint:nav", checkReel);
  setInterval(checkReel, 400); // some feeds swap content without touching history

  function checkReel() {
    if (!settings.enabled || gateOpen) return;
    if (!site.isReel()) {
      lastReelKey = null;
      return;
    }
    const key = site.reelKey();
    if (!key || key === lastReelKey) return;
    lastReelKey = key;
    reelsSinceGate += 1;
    if (reelsSinceGate >= Math.max(1, settings.reelsPerQuestion)) {
      reelsSinceGate = 0;
      openGate("reel");
    }
  }

  /* ---- chat timer ------------------------------------------------ */

  setInterval(() => {
    if (!settings.enabled || gateOpen) return;
    const active =
      site.isChat() && document.visibilityState === "visible" && document.hasFocus();
    if (!active) {
      awayTicks += 1;
      if (awayTicks > 120) chatSeconds = 0; // two minutes away resets the clock
      return;
    }
    awayTicks = 0;
    chatSeconds += 1;
    if (chatSeconds >= Math.max(1, settings.chatMinutes) * 60) {
      chatSeconds = 0;
      openGate("chat");
    }
  }, 1000);

  /* ---- media + input locking ------------------------------------- */

  function freezeMedia() {
    document.querySelectorAll("video, audio").forEach((m) => {
      try { m.pause(); } catch (e) {}
    });
  }

  function resumeMedia() {
    const v = [...document.querySelectorAll("video")].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.top < window.innerHeight && r.bottom > 0;
    });
    if (v) v.play().catch(() => {});
  }

  function insideOverlay(e) {
    return typeof e.composedPath === "function" && e.composedPath().includes(hostEl);
  }

  function swallow(e) {
    if (insideOverlay(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  const LOCKED_EVENTS = ["wheel", "touchmove", "keydown", "keyup", "keypress", "mousedown", "click"];

  function lockInput() {
    LOCKED_EVENTS.forEach((t) => window.addEventListener(t, swallow, { capture: true, passive: false }));
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function unlockInput() {
    LOCKED_EVENTS.forEach((t) => window.removeEventListener(t, swallow, { capture: true }));
    document.documentElement.style.overflow = savedOverflow;
  }

  // Some sites aggressively rewrite the DOM. Put the overlay back if it vanishes.
  const guard = new MutationObserver(() => {
    if (gateOpen && hostEl && !document.documentElement.contains(hostEl)) {
      document.documentElement.appendChild(hostEl);
    }
  });

  /* ---- the gate -------------------------------------------------- */

  function openGate(reason) {
    if (gateOpen || !settings.enabled) return;
    gateOpen = true;

    freezeMedia();
    pauseTimer = setInterval(freezeMedia, 250);

    hostEl = document.createElement("div");
    hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
    const shadow = hostEl.attachShadow({ mode: "closed" });
    shadow.appendChild(buildStyles());
    const mount = document.createElement("div");
    mount.className = "backdrop";
    shadow.appendChild(mount);
    document.documentElement.appendChild(hostEl);

    lockInput();
    guard.observe(document.documentElement, { childList: true, subtree: false });

    loadQuestion(mount, reason);
  }

  function closeGate() {
    if (!gateOpen) return;
    gateOpen = false;
    guard.disconnect();
    clearInterval(pauseTimer);
    unlockInput();
    if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    hostEl = null;
    resumeMedia();
  }

  let activeMount = null;
  let activeReason = null;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "signedIn" && gateOpen && activeMount) {
      loadQuestion(activeMount, activeReason);
    }
  });

  function loadQuestion(mount, reason) {
    activeMount = mount;
    activeReason = reason;
    mount.innerHTML = '<div class="card loading"><p class="wait">Loading a question…</p></div>';
    safeSendMessage({ type: "getQuestion" }, (q) => {
      if (!q) {
        // Empty bank should never trap the tab.
        closeGate();
        return;
      }
      renderQuestion(mount, q, reason);
    });
  }

  function renderQuestion(mount, q, reason) {
    const heading = reason === "chat" ? "Five minutes of chat" : "Next reel";

    mount.innerHTML = "";
    const card = document.createElement("div");
    card.className = "card";

    safeSendMessage({ type: "getMe" }, (auth) => {
      const isSignedIn = auth && auth.signedIn;
      if (q.offline && !isSignedIn) {
        const notice = document.createElement("div");
        notice.className = "offline-banner";
        notice.innerHTML = `
          <span>Offline mode. Sign in with Google for live AI questions.</span>
          <button class="signin-btn">Sign in</button>
        `;
        notice.querySelector(".signin-btn").addEventListener("click", () => {
          const btn = notice.querySelector(".signin-btn");
          btn.disabled = true;
          btn.textContent = "Signing in…";
          safeSendMessage({ type: "signIn" }, (res) => {
            if (res && res.ok) {
              notice.innerHTML = `<span style="color:#1f7a54; font-weight:600;">Signed in! Loading server questions…</span>`;
              setTimeout(() => loadQuestion(mount, reason), 600);
            } else {
              btn.disabled = false;
              btn.textContent = "Sign in";
              alert("Sign in error: " + (res ? res.error : "Please enter Worker URL in extension popup"));
            }
          });
        });
        card.prepend(notice);
      }
    });

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML =
      '<span class="reason"></span><span class="topic"></span>';
    meta.querySelector(".reason").textContent = heading;
    meta.querySelector(".topic").textContent = q.label;
    card.appendChild(meta);

    const prompt = document.createElement("p");
    prompt.className = "prompt";
    prompt.textContent = q.q;
    card.appendChild(prompt);

    const list = document.createElement("div");
    list.className = "options";
    const buttons = q.opts.map((text, i) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.disabled = true;
      b.innerHTML = '<span class="mark"></span><span class="text"></span>';
      b.querySelector(".mark").textContent = "ABCD"[i];
      b.querySelector(".text").textContent = text;
      b.addEventListener("click", () => answer(i));
      list.appendChild(b);
      return b;
    });
    card.appendChild(list);

    const bar = document.createElement("div");
    bar.className = "arming";
    bar.innerHTML = '<i></i>';
    card.appendChild(bar);

    const foot = document.createElement("div");
    foot.className = "foot";
    card.appendChild(foot);

    mount.appendChild(card);

    const delay = Math.max(0, settings.answerDelayMs || 0);
    bar.querySelector("i").style.transitionDuration = delay + "ms";
    requestAnimationFrame(() => bar.querySelector("i").style.width = "100%");
    setTimeout(() => {
      buttons.forEach((b) => (b.disabled = false));
      bar.remove();
    }, delay);

    const shownAt = Date.now();
    let settled = false;
    function answer(choice) {
      if (settled) return;
      settled = true;
      const right = choice === q.a;
      buttons.forEach((b, i) => {
        b.disabled = true;
        if (i === q.a) b.classList.add("right");
        if (i === choice && !right) b.classList.add("wrong");
      });
      if (!right) {
        card.classList.remove("nudge");
        void card.offsetWidth;
        card.classList.add("nudge");
      }

      safeSendMessage({
        type: "recordAnswer",
        topic: q.topic,
        serverId: q.serverId,
        chosen: choice,
        correct: right,
        gate: true,
        gateKind: reason,
        latencyMs: Date.now() - shownAt
      });

      const why = document.createElement("p");
      why.className = "why";
      why.textContent = q.why || "";
      foot.appendChild(why);

      const go = document.createElement("button");
      go.className = "go";
      if (right) {
        go.textContent = reason === "chat" ? "Back to the chat" : "Play the reel";
        go.addEventListener("click", closeGate);
      } else if (settings.requireNewOnWrong) {
        go.textContent = "Try another question";
        go.addEventListener("click", () => loadQuestion(mount, reason));
      } else {
        go.textContent = reason === "chat" ? "Back to the chat" : "Play the reel";
        go.addEventListener("click", closeGate);
      }
      foot.appendChild(go);
      go.focus();

      if (q.serverId) {
        const reportBtn = document.createElement("button");
        reportBtn.className = "report-link";
        reportBtn.textContent = "Report incorrect answer / question";
        reportBtn.style.cssText = "display: block; margin-top: 12px; background: none; border: none; color: #77849e; font-size: 12px; cursor: pointer; text-decoration: underline;";
        reportBtn.addEventListener("click", () => {
          reportBtn.disabled = true;
          reportBtn.textContent = "Reporting…";
          safeSendMessage({
            type: "reportQuestion",
            questionId: q.serverId,
            reason: "User reported question error"
          }, (res) => {
            if (res && !res.error) {
              reportBtn.textContent = "Reported. Thank you!";
            } else {
              reportBtn.textContent = "Report failed";
            }
          });
        });
        foot.appendChild(reportBtn);
      }
    }
  }

  /* ---- styles ---------------------------------------------------- */

  function buildStyles() {
    const s = document.createElement("style");
    s.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

      .backdrop {
        position: fixed; inset: 0;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        background: rgba(16, 26, 48, 0.82);
        backdrop-filter: blur(18px) saturate(0.6);
        -webkit-backdrop-filter: blur(18px) saturate(0.6);
      }

      .card {
        width: min(560px, 100%);
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        padding: 30px 32px 28px;
        color: #16223d;
        background-color: #eef1f4;
        background-image:
          linear-gradient(rgba(37,64,143,0.09) 1px, transparent 1px),
          linear-gradient(90deg, rgba(37,64,143,0.09) 1px, transparent 1px);
        background-size: 22px 22px;
        border: 1px solid rgba(22,34,61,0.18);
        box-shadow: 0 30px 70px rgba(9,16,33,0.45);
        animation: rise 260ms cubic-bezier(.2,.7,.3,1) both;
      }
      @keyframes rise { from { opacity: 0; transform: translateY(14px); } }

      .offline-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 9px 13px; margin-bottom: 18px; background: #fff8e6; border: 1px solid #f0b429;
        font-size: 13px; color: #744210;
      }
      .offline-banner .signin-btn {
        padding: 5px 12px; font-size: 12px; font-weight: 600; color: #fff;
        background: #25408f; border: none; cursor: pointer; flex-shrink: 0;
      }
      .offline-banner .signin-btn:hover { background: #1c3273; }

      .meta {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 16px; padding-bottom: 14px; margin-bottom: 20px;
        border-bottom: 2px solid #25408f;
        font-size: 13px; letter-spacing: 0.01em;
      }
      .reason { font-weight: 600; color: #25408f; }
      .topic { color: #55607a; }

      .prompt {
        font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
        font-size: 21px; line-height: 1.45; margin-bottom: 22px;
        max-width: 46ch;
      }

      .options { display: flex; flex-direction: column; gap: 9px; }
      .opt {
        display: flex; align-items: flex-start; gap: 12px; width: 100%;
        padding: 13px 15px; text-align: left; cursor: pointer;
        font-size: 15px; line-height: 1.4; color: #16223d;
        background: #ffffff;
        border: 1px solid rgba(22,34,61,0.2);
        transition: border-color 120ms, background 120ms;
      }
      .opt:hover:not(:disabled) { border-color: #25408f; background: #f7f9ff; }
      .opt:focus-visible { outline: 2px solid #25408f; outline-offset: 2px; }
      .opt:disabled { cursor: default; }
      .opt .mark {
        flex: none; width: 21px; height: 21px; margin-top: 1px;
        display: grid; place-items: center;
        font-size: 11px; font-weight: 700; color: #55607a;
        border: 1px solid rgba(22,34,61,0.25); border-radius: 50%;
      }
      .opt.right { background: #e6f3ec; border-color: #1f7a54; }
      .opt.right .mark { background: #1f7a54; border-color: #1f7a54; color: #fff; }
      .opt.wrong { background: #f7e8e6; border-color: #a8342a; }
      .opt.wrong .mark { background: #a8342a; border-color: #a8342a; color: #fff; }

      .arming { height: 2px; margin-top: 18px; background: rgba(22,34,61,0.12); }
      .arming i { display: block; height: 100%; width: 0; background: #25408f; transition: width linear; }

      .foot:not(:empty) { margin-top: 22px; padding-top: 18px; border-top: 1px solid rgba(22,34,61,0.15); }
      .why { font-size: 14px; line-height: 1.55; color: #3c465e; max-width: 52ch; margin-bottom: 16px; }
      .go {
        padding: 11px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
        color: #fff; background: #25408f; border: none;
      }
      .go:hover { background: #1c3273; }
      .go:focus-visible { outline: 2px solid #16223d; outline-offset: 2px; }

      .loading { display: grid; place-items: center; min-height: 140px; }
      .wait { font-size: 14px; color: #55607a; }

      .nudge { animation: nudge 240ms ease; }
      @keyframes nudge {
        25% { transform: translateX(-6px); } 50% { transform: translateX(6px); }
        75% { transform: translateX(-3px); } 100% { transform: none; }
      }

      @media (prefers-reduced-motion: reduce) {
        .card, .nudge { animation: none; }
      }
      @media (max-width: 520px) {
        .card { padding: 24px 20px; }
        .prompt { font-size: 19px; }
      }
    `;
    return s;
  }
})();
