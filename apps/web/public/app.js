const state = {
  bootstrap: null,
  kind: "channel",
  id: "",
};

const els = {
  channels: document.getElementById("channel-list"),
  dms: document.getElementById("dm-list"),
  people: document.getElementById("people"),
  thread: document.getElementById("thread"),
  log: document.getElementById("log"),
  title: document.getElementById("room-title"),
  kicker: document.getElementById("room-kicker"),
  mode: document.getElementById("mode"),
  meta: document.getElementById("meta"),
  form: document.getElementById("composer"),
  draft: document.getElementById("draft"),
  send: document.getElementById("send"),
  thinkingBtn: document.getElementById("thinking-btn"),
  toolsBtn: document.getElementById("tools-btn"),
  modelBtn: document.getElementById("model-btn"),
  modelModal: document.getElementById("model-modal"),
  modelList: document.getElementById("model-list"),
  modelCustom: document.getElementById("model-custom"),
};

function pressed(btn) {
  return btn.getAttribute("aria-pressed") === "true";
}

function shortModel(id) {
  const parts = String(id).split("/");
  return parts[parts.length - 1] || id;
}

function syncModelChip() {
  const id = state.bootstrap?.model ?? "model";
  els.modelBtn.textContent = shortModel(id);
  els.modelBtn.title = id;
}

function scrollThread() {
  const el = els.thread;
  el.scrollTop = el.scrollHeight;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function pinBottom() {
  scrollThread();
  requestAnimationFrame(scrollThread);
}

function setDraftPlaceholder() {
  els.draft.placeholder =
    state.kind === "dm" ? `Message ${state.id}` : `Message #${state.id || "channel"}`;
}

function renderRail() {
  const b = state.bootstrap;
  els.channels.replaceChildren();
  for (const ch of b.channels) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `#${ch.id}`;
    btn.className = state.kind === "channel" && state.id === ch.id ? "on" : "";
    btn.onclick = () => openThread("channel", ch.id);
    els.channels.append(btn);
  }
  els.dms.replaceChildren();
  if (!b.dms.length) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.disabled = true;
    empty.textContent = "None yet";
    els.dms.append(empty);
  }
  for (const id of b.dms) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = id.replaceAll("__", " · ");
    btn.className = state.kind === "dm" && state.id === id ? "on" : "";
    btn.onclick = () => openThread("dm", id);
    els.dms.append(btn);
  }
  els.meta.textContent = b.model;
  syncModelChip();
  renderPeople();
}

function renderPeople() {
  els.people.replaceChildren();
  const ch = state.bootstrap?.channels.find((c) => c.id === state.id);
  const ids = state.kind === "channel" && ch ? ch.memberBotIds : [];
  const show = ids.length ? ids : (state.bootstrap?.bots ?? []).map((b) => b.id);
  for (const id of ["you", ...show]) {
    const face = faceFor(id);
    const row = document.createElement("div");
    row.className = "person";
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = face.glyph;
    av.style.background = face.bg;
    av.style.color = face.fg;
    const label = document.createElement("span");
    label.textContent = displayName(id);
    row.append(av, label);
    els.people.append(row);
  }
}

const FACES = {
  you: { glyph: "●", bg: "#2c313a", fg: "#d7dbe2" },
  lead: { glyph: "◆", bg: "#24344f", fg: "#9bb6e3" },
  designer: { glyph: "✦", bg: "#3f2a38", fg: "#e2b0c8" },
  coder: { glyph: "λ", bg: "#1d3a36", fg: "#8fd0c1" },
  tester: { glyph: "▣", bg: "#3a311c", fg: "#ddc07a" },
  researcher: { glyph: "※", bg: "#2a382c", fg: "#a9c9a0" },
};

function botIdFromWho(who, botId) {
  if (who === "you") return "you";
  if (botId) return botId;
  const m = String(who).match(/@([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : "bot";
}

function faceFor(id) {
  if (FACES[id]) return FACES[id];
  let n = 0;
  for (const ch of id) n = (n * 33 + ch.charCodeAt(0)) % 360;
  return {
    glyph: (id[0] || "?").toUpperCase(),
    bg: `hsl(${n} 18% 22%)`,
    fg: `hsl(${n} 28% 78%)`,
  };
}

function displayName(id) {
  if (id === "you") return "You";
  const bot = state.bootstrap?.bots?.find((b) => b.id === id);
  return bot?.name || id;
}

function addMessage({ who, botId, text, kind }) {
  const id = botIdFromWho(who, botId);
  const isYou = id === "you";
  const face = faceFor(id);
  const li = document.createElement("li");
  li.className = `msg ${isYou ? "you" : "bot"}`;
  if (kind === "error") li.classList.add("error");
  if (kind === "thinking" || kind === "tool") li.classList.add("desk");

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = face.glyph;
  avatar.style.background = face.bg;
  avatar.style.color = face.fg;
  avatar.title = displayName(id);

  const col = document.createElement("div");
  col.className = "col";
  const whoEl = document.createElement("p");
  whoEl.className = "who";
  whoEl.style.color = face.fg;
  whoEl.textContent = displayName(id);
  if (!isYou) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `@${id}`;
    whoEl.append(tag);
  }
  const copy = document.createElement("p");
  copy.className = "copy";
  copy.textContent = text;
  col.append(whoEl, copy);
  li.append(avatar, col);
  els.log.append(li);
  pinBottom();
  return copy;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res;
}

async function openThread(kind, id) {
  state.kind = kind;
  state.id = id;
  const ch = state.bootstrap.channels.find((c) => c.id === id);
  els.kicker.textContent = kind;
  els.title.textContent = kind === "channel" ? `#${id}` : id.replaceAll("__", " · ");
  if (ch) els.mode.value = ch.permissionMode;
  els.mode.disabled = kind !== "channel";
  setDraftPlaceholder();
  renderRail();
  const q = new URLSearchParams({
    kind,
    id,
    thinking: pressed(els.thinkingBtn) ? "1" : "0",
    verbose: pressed(els.toolsBtn) ? "1" : "0",
  });
  const rows = await (await api(`/api/thread?${q}`)).json();
  els.log.replaceChildren();
  for (const row of rows) {
    if (row.type === "message") {
      addMessage({ who: row.who, botId: row.botId, text: row.text });
    } else if (row.type === "thinking") {
      addMessage({
        who: `@${row.botId}`,
        botId: row.botId,
        text: row.text,
        kind: "thinking",
      });
    } else if (row.type === "tool") {
      addMessage({
        who: `@${row.botId}`,
        botId: row.botId,
        text: row.name,
        kind: "tool",
      });
    } else if (row.type === "error") {
      addMessage({
        who: `@${row.botId}`,
        botId: row.botId,
        text: row.text,
        kind: "error",
      });
    }
  }
  pinBottom();
  setTimeout(pinBottom, 50);
}

async function boot() {
  state.bootstrap = await (await api("/api/bootstrap")).json();
  renderRail();
  const first = state.bootstrap.channels[0];
  if (first) await openThread("channel", first.id);
}

function toggleChip(btn) {
  btn.setAttribute("aria-pressed", pressed(btn) ? "false" : "true");
}

els.thinkingBtn.addEventListener("click", () => toggleChip(els.thinkingBtn));
els.toolsBtn.addEventListener("click", () => toggleChip(els.toolsBtn));

function fillModelModal() {
  const current = state.bootstrap.model;
  const models = state.bootstrap.models ?? [current];
  els.modelList.replaceChildren();
  for (const id of models) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = id;
    btn.className = id === current ? "on" : "";
    btn.onclick = () => {
      els.modelCustom.value = id;
      for (const b of els.modelList.children) b.classList.toggle("on", b === btn);
    };
    els.modelList.append(btn);
  }
  els.modelCustom.value = current;
}

els.modelBtn.addEventListener("click", () => {
  fillModelModal();
  els.modelModal.showModal();
});

document.getElementById("model-form").addEventListener("submit", async (ev) => {
  if (ev.submitter?.value !== "ok") return;
  ev.preventDefault();
  const model = els.modelCustom.value.trim();
  if (!model) return;
  const res = await (await api("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  })).json();
  state.bootstrap.model = res.model;
  if (!state.bootstrap.models.includes(res.model)) state.bootstrap.models.unshift(res.model);
  syncModelChip();
  els.modelModal.close();
});

els.mode.addEventListener("change", async () => {
  if (state.kind !== "channel") return;
  await api("/api/mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId: state.id, mode: els.mode.value }),
  });
  const ch = state.bootstrap.channels.find((c) => c.id === state.id);
  if (ch) ch.permissionMode = els.mode.value;
});

els.draft.addEventListener("input", () => {
  els.draft.style.height = "auto";
  els.draft.style.height = `${Math.min(els.draft.scrollHeight, 160)}px`;
});

els.draft.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    els.form.requestSubmit();
  }
});

els.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = els.draft.value.trim();
  if (!text || !state.id) return;
  els.send.disabled = true;
  addMessage({ who: "you", text });
  els.draft.value = "";
  els.draft.style.height = "auto";
  const bodies = new Map();
  try {
    if (state.kind === "dm") {
      const to = state.id.startsWith("human__")
        ? state.id.slice("human__".length)
        : state.id.split("__").find((p) => p !== "human") ?? state.id;
      await api("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "human", to, text }),
      });
      state.bootstrap = await (await api("/api/bootstrap")).json();
      await openThread("dm", state.id);
    } else {
      const res = await fetch("/api/say", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: state.id,
          text,
          thinking: pressed(els.thinkingBtn),
          verbose: pressed(els.toolsBtn),
        }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const row = JSON.parse(line);
          if (row.type === "status") {
            const li = document.createElement("li");
            li.className = "status";
            li.textContent = row.message;
            els.log.append(li);
            pinBottom();
          } else if (row.type === "text") {
            let body = bodies.get(row.botId);
            if (!body) {
              body = addMessage({ who: `@${row.botId}`, botId: row.botId, text: "" });
              bodies.set(row.botId, body);
            }
            body.textContent += row.text;
            pinBottom();
          } else if (row.type === "error") {
            addMessage({
              who: `@${row.botId ?? "engine"}`,
              botId: row.botId,
              text: row.message,
              kind: "error",
            });
          } else if (row.type === "done" && row.dms?.length) {
            state.bootstrap = await (await api("/api/bootstrap")).json();
            renderRail();
          }
        }
      }
    }
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
  els.send.disabled = false;
  pinBottom();
  els.draft.focus();
});

boot().catch((err) => {
  addMessage({ who: "error", text: String(err), kind: "error" });
});
