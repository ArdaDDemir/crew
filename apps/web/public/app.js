const state = {
  bootstrap: null,
  kind: "channel",
  id: "",
};

const els = {
  channels: document.getElementById("channel-list"),
  dms: document.getElementById("dm-list"),
  thread: document.getElementById("thread"),
  log: document.getElementById("log"),
  title: document.getElementById("room-title"),
  kicker: document.getElementById("room-kicker"),
  mode: document.getElementById("mode"),
  meta: document.getElementById("meta"),
  form: document.getElementById("composer"),
  draft: document.getElementById("draft"),
  send: document.getElementById("send"),
  thinking: document.getElementById("thinking"),
  verbose: document.getElementById("verbose"),
};

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
}

function addMessage({ who, botId, text, kind }) {
  const li = document.createElement("li");
  const isYou = who === "you";
  li.className = `msg ${isYou ? "you" : "bot"}`;
  if (kind === "error") li.classList.add("error");
  if (kind === "thinking" || kind === "tool") li.classList.add("desk");
  const whoEl = document.createElement("p");
  whoEl.className = "who";
  whoEl.textContent = who;
  const copy = document.createElement("p");
  copy.className = "copy";
  copy.textContent = text;
  li.append(whoEl, copy);
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
    thinking: els.thinking.checked ? "1" : "0",
    verbose: els.verbose.checked ? "1" : "0",
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
          thinking: els.thinking.checked,
          verbose: els.verbose.checked,
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
