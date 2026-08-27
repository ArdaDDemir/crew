const state = {
  bootstrap: null,
  kind: "channel",
  id: "",
};

const els = {
  channels: document.getElementById("channel-list"),
  dms: document.getElementById("dm-list"),
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

function plateColor(id) {
  let n = 0;
  for (const ch of id) n = (n * 33 + ch.charCodeAt(0)) % 360;
  return `hsl(${n} 12% 62%)`;
}

function scrollLog() {
  const el = els.log;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  });
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res;
}

function renderRail() {
  const b = state.bootstrap;
  els.channels.innerHTML = "";
  for (const ch of b.channels) {
    const btn = document.createElement("button");
    btn.textContent = `#${ch.id}`;
    btn.className = state.kind === "channel" && state.id === ch.id ? "on" : "";
    btn.onclick = () => openThread("channel", ch.id);
    els.channels.append(btn);
  }
  els.dms.innerHTML = "";
  if (!b.dms.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "none yet";
    els.dms.append(p);
  }
  for (const id of b.dms) {
    const btn = document.createElement("button");
    btn.textContent = id;
    btn.className = state.kind === "dm" && state.id === id ? "on" : "";
    btn.onclick = () => openThread("dm", id);
    els.dms.append(btn);
  }
  els.meta.textContent = `model ${b.model}`;
}

function addBubble({ who, botId, text, kind }) {
  const li = document.createElement("li");
  li.className = "bubble";
  if (who === "you") li.classList.add("you");
  if (kind === "error") li.classList.add("error");
  if (kind === "thinking" || kind === "tool") li.classList.add("desk");
  const plate = document.createElement("p");
  plate.className = "plate";
  plate.textContent = who;
  if (botId) plate.style.color = plateColor(botId);
  const body = document.createElement("p");
  body.className = "body";
  body.textContent = text;
  li.append(plate, body);
  els.log.append(li);
  scrollLog();
  return body;
}

async function openThread(kind, id) {
  state.kind = kind;
  state.id = id;
  const ch = state.bootstrap.channels.find((c) => c.id === id);
  els.kicker.textContent = kind;
  els.title.textContent = kind === "channel" ? `#${id}` : id;
  if (ch) els.mode.value = ch.permissionMode;
  els.mode.disabled = kind !== "channel";
  renderRail();
  const thinking = els.thinking.checked ? "1" : "0";
  const verbose = els.verbose.checked ? "1" : "0";
  const rows = await (await api(`/api/thread?kind=${kind}&id=${encodeURIComponent(id)}&thinking=${thinking}&verbose=${verbose}`)).json();
  els.log.innerHTML = "";
  for (const row of rows) {
    if (row.type === "message") {
      addBubble({ who: row.who, botId: row.botId, text: row.text });
    } else if (row.type === "thinking") {
      addBubble({ who: `@${row.botId} thinking`, botId: row.botId, text: row.text, kind: "thinking" });
    } else if (row.type === "tool") {
      addBubble({ who: `@${row.botId} tool`, botId: row.botId, text: row.name, kind: "tool" });
    } else if (row.type === "error") {
      addBubble({ who: `@${row.botId} error`, botId: row.botId, text: row.text, kind: "error" });
    }
  }
  scrollLog();
}

async function boot() {
  state.bootstrap = await (await api("/api/bootstrap")).json();
  const first = state.bootstrap.channels[0];
  renderRail();
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

els.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = els.draft.value.trim();
  if (!text || !state.id) return;
  els.send.disabled = true;
  addBubble({ who: "you", text });
  els.draft.value = "";
  const bodies = new Map();
  try {
    if (state.kind === "dm") {
      const to = state.id.startsWith("human__")
        ? state.id.slice("human__".length)
        : state.id.split("__")[0];
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
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const row = JSON.parse(line);
          if (row.type === "status") {
            const p = document.createElement("li");
            p.className = "status";
            p.textContent = `→ ${row.message}`;
            els.log.append(p);
          } else if (row.type === "text") {
            let body = bodies.get(row.botId);
            if (!body) {
              body = addBubble({ who: `@${row.botId}`, botId: row.botId, text: "" });
              bodies.set(row.botId, body);
            }
            body.textContent += row.text;
            scrollLog();
          } else if (row.type === "error") {
            addBubble({
              who: `@${row.botId ?? "engine"} error`,
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
    addBubble({ who: "engine error", text: String(err), kind: "error" });
  }
  els.send.disabled = false;
  scrollLog();
});

boot().catch((err) => {
  addBubble({ who: "engine error", text: String(err), kind: "error" });
});
