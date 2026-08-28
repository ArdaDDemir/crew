const THREAD_MIME = "application/x-crew-thread";

const state = {
  bootstrap: null,
  kind: "channel",
  id: "",
  editBotId: "",
  busy: new Set(),
  activity: {},
  lastPrompt: "",
  running: false,
  createKind: "channel",
  panes: [null, null],
  split: "none",
  activePane: 0,
  runPane: 0,
};

const paneAttach = [[], []];

function ico(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function decorateEl(el, icon) {
  if (!el || el.dataset.iconed) return;
  el.dataset.iconed = "1";
  const label = [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join("")
    .trim();
  el.textContent = "";
  el.append(ico(icon));
  if (label && label !== "+" && label !== "×") {
    const s = document.createElement("span");
    s.textContent = label;
    el.append(s);
  }
}

function decorate(id, icon) {
  decorateEl(document.getElementById(id), icon);
}

function setBtnText(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  let s = el.querySelector("span");
  if (!s) {
    s = document.createElement("span");
    el.append(s);
  }
  s.textContent = text;
}

function decorateChrome() {
  const map = {
    "add-channel": "plus",
    "add-person": "plus",
    "app-settings": "gear",
    "menu-btn": "menu",
    "files-btn": "file",
    "export-btn": "download",
    "title-regen": "pencil",
    "settings-btn": "hash",
    "attach-file": "file",
    "attach-folder": "folder",
    "jump-latest": "chevron",
    stop: "stop",
    send: "send",
    "ch-cancel": "x",
    "ch-delete": "trash",
    "ch-save": "check",
    "bot-cancel": "x",
    "bot-delete": "trash",
    "bot-save": "check",
    "skill-cancel": "x",
    "skill-delete": "trash",
    "skill-save": "check",
    "skill-open": "plus",
    "ch-add-file": "file",
    "ch-add-folder": "folder",
    "ch-path-plus": "plus",
    "mode-close": "x",
    "app-close": "x",
    "files-close": "x",
    "slash-help-close": "x",
    "app-key-save": "check",
    "always-clear": "trash",
  };
  for (const [id, icon] of Object.entries(map)) decorate(id, icon);
}

const els = {
  channels: document.getElementById("channel-list"),
  people: document.getElementById("people"),
  direct: document.getElementById("direct"),
  thread: null,
  log: null,
  title: null,
  kicker: null,
  modeBtn: null,
  modeModal: document.getElementById("mode-modal"),
  form: null,
  draft: null,
  send: null,
  stop: null,
  palette: null,
  settingsBtn: null,
  search: null,
  pinStrip: null,
  workChip: null,
  jumpLatest: null,
  attachChips: null,
  appSettings: document.getElementById("app-settings"),
  appModal: document.getElementById("app-modal"),
  channelModal: document.getElementById("channel-modal"),
  botModal: document.getElementById("bot-modal"),
  skillModal: document.getElementById("skill-modal"),
  desk: document.getElementById("desk"),
  hereList: document.getElementById("here-list"),
  deskLabel: document.getElementById("desk-label"),
};

function paneRoot(i) {
  return document.getElementById(`pane-${i}`) ?? document.getElementById("pane-0");
}

function bindPane(i) {
  const r = paneRoot(i);
  if (!r) return;
  els.thread = r.querySelector(".thread");
  els.log = r.querySelector(".log");
  els.title = r.querySelector(".room-title");
  els.kicker = r.querySelector(".room-kicker");
  els.form = r.querySelector(".composer");
  els.draft = r.querySelector(".draft");
  els.send = r.querySelector(".send") || r.querySelector("button[type=submit]");
  els.stop = r.querySelector(".stop") || r.querySelector("#stop");
  els.palette = r.querySelector(".palette");
  els.modeBtn = r.querySelector(".mode-btn");
  els.settingsBtn = r.querySelector(".settings-btn");
  els.search = r.querySelector(".search");
  els.pinStrip = r.querySelector(".pin-strip");
  els.workChip = r.querySelector(".work-chip");
  els.jumpLatest = r.querySelector(".jump-latest");
  els.attachChips = r.querySelector(".attach-chips");
}

function paneShows(kind, id) {
  return (state.panes ?? []).some((p) => p && p.kind === kind && p.id === id);
}

function markActivePane(i) {
  document.getElementById("pane-0")?.classList.toggle("active", i === 0);
  document.getElementById("pane-1")?.classList.toggle("active", i === 1 && state.split !== "none");
}

function activatePane(i) {
  const idx = i === 1 ? 1 : 0;
  state.activePane = idx;
  bindPane(idx);
  const p = state.panes[idx];
  if (p) {
    state.kind = p.kind;
    state.id = p.id;
  }
  markActivePane(idx);
  renderPresence();
  renderWorkChip();
  renderContextChip();
}

function threadStillExists(kind, id) {
  if (!kind || !id) return false;
  if (kind === "channel") {
    return Boolean(state.bootstrap?.channels?.some((c) => c.id === id));
  }
  if (kind === "dm") {
    if (state.bootstrap?.dms?.some((d) => d.id === id)) return true;
    return String(id).startsWith("human__");
  }
  return false;
}

function saveSplit() {
  try {
    sessionStorage.setItem(
      "crew.split",
      JSON.stringify({ split: state.split, panes: state.panes }),
    );
  } catch {
    /* ignore quota */
  }
}

function applySplitClass(how) {
  const host = document.getElementById("panes");
  if (!host) return;
  host.classList.remove("split-none", "split-right", "split-below");
  host.classList.add(`split-${how}`);
  host.style.gridTemplateColumns = "";
  host.style.gridTemplateRows = "";
  const extra = document.getElementById("pane-1");
  const handle = document.getElementById("split-handle");
  if (how === "none") {
    if (extra) extra.hidden = true;
    if (handle) handle.hidden = true;
  } else {
    if (extra) extra.hidden = false;
    if (handle) handle.hidden = false;
  }
}

function closeSplit() {
  state.split = "none";
  state.panes[1] = null;
  state.activePane = 0;
  applySplitClass("none");
  bindPane(0);
  const p = state.panes[0];
  if (p) {
    state.kind = p.kind;
    state.id = p.id;
  }
  markActivePane(0);
  renderPresence();
  renderWorkChip();
  renderContextChip();
  saveSplit();
}

function resolvePaneTarget(kind, id) {
  if (kind === "person") {
    return { kind: "dm", id: latestHumanDm(id)?.id || `human__${id}` };
  }
  return { kind, id };
}

function paneOpen(index, kind, id) {
  const i = index === 1 ? 1 : 0;
  const next = resolvePaneTarget(kind, id);
  state.panes[i] = { kind: next.kind, id: next.id };
  state.activePane = i;
  bindPane(i);
  markActivePane(i);
  saveSplit();
  return openThread(next.kind, next.id);
}

function splitOpen(kind, id, how) {
  const next = resolvePaneTarget(kind, id);
  if (how === "right" || how === "below") {
    state.split = how;
    applySplitClass(how);
    saveSplit();
    return paneOpen(1, next.kind, next.id);
  }
  return paneOpen(state.activePane, next.kind, next.id);
}

bindPane(0);
markActivePane(0);

let currentTurn = null;
let searchHit = 0;

document.addEventListener(
  "click",
  (ev) => {
    const btn = ev.target.closest("[data-close]");
    if (btn) {
      const dlg = btn.closest("dialog");
      if (dlg) {
        ev.preventDefault();
        ev.stopPropagation();
        dlg.close();
      }
      return;
    }
    if (ev.target instanceof HTMLDialogElement && ev.target.tagName === "DIALOG") {
      ev.target.close();
    }
  },
  true,
);

function seenMap() {
  try {
    return JSON.parse(localStorage.getItem("crew.seen") || "{}");
  } catch {
    return {};
  }
}

function saveSeen(map) {
  localStorage.setItem("crew.seen", JSON.stringify(map));
}

function threadKey(kind, id) {
  return `${kind}:${id}`;
}

function clearedMap() {
  try {
    return JSON.parse(sessionStorage.getItem("crew.clearedAt") || "{}");
  } catch {
    return {};
  }
}

function clearedAt(kind, id) {
  return clearedMap()[threadKey(kind, id)] || "";
}

function setClearedNow() {
  const map = clearedMap();
  map[threadKey(state.kind, state.id)] = new Date().toISOString();
  sessionStorage.setItem("crew.clearedAt", JSON.stringify(map));
}

function postedOf(kind, id) {
  return state.bootstrap?.posted?.[threadKey(kind, id)] ?? 0;
}

function unreadOf(kind, id) {
  const seen = seenMap()[threadKey(kind, id)] ?? 0;
  return Math.max(0, postedOf(kind, id) - seen);
}

function markRead(kind, id) {
  const map = seenMap();
  map[threadKey(kind, id)] = postedOf(kind, id);
  saveSeen(map);
}

function badgeEl(n) {
  if (!n) return null;
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = n > 99 ? "99+" : String(n);
  return b;
}

function currentChannel() {
  if (state.kind !== "channel" || !state.id) return null;
  return state.bootstrap?.channels.find((c) => c.id === state.id) ?? null;
}

function allowedModels() {
  return state.bootstrap?.models ?? [];
}

function fillModelSelect(select, current, blank) {
  const ids = [...new Set([current, ...allowedModels()].filter(Boolean))];
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = blank;
  select.append(empty);
  for (const id of ids) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    select.append(opt);
  }
  select.value = current || "";
}

function syncModeChip() {
  if (!els.modeBtn) return;
  const ch = currentChannel();
  const mode = ch?.permissionMode ?? "auto-accept";
  els.modeBtn.textContent = mode;
  els.modeBtn.disabled = !ch;
}

function nearBottom() {
  const el = els.thread;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function scrollThread() {
  const el = els.thread;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function pinBottom() {
  const jump = els.jumpLatest;
  if (!nearBottom() && els.thread?.scrollTop > 0) {
    if (jump) jump.hidden = false;
    return;
  }
  if (jump) jump.hidden = true;
  scrollThread();
  requestAnimationFrame(scrollThread);
}

function applySearch() {
  const q = (els.search?.value || "").trim().toLowerCase();
  const msgs = [...(els.log?.querySelectorAll(".msg") ?? [])];
  const hits = [];
  for (const m of msgs) {
    const text = (m.querySelector(".copy")?.dataset.raw || m.textContent || "").toLowerCase();
    const match = !q || text.includes(q);
    m.classList.toggle("miss", Boolean(q) && !match);
    m.classList.toggle("hit", Boolean(q) && match);
    m.classList.remove("current");
    if (q && match) hits.push(m);
  }
  return hits;
}

function setDraftPlaceholder() {
  if (!els.draft) return;
  if (state.kind === "dm" && isWatchingDm(state.id)) {
    els.draft.placeholder = `Watching ${dmHeadline(state.id)}`;
    els.draft.disabled = true;
    if (els.send) els.send.disabled = true;
    return;
  }
  els.draft.disabled = false;
  if (els.send) els.send.disabled = false;
  els.draft.placeholder =
    state.kind === "dm" ? `Message ${dmHeadline(state.id)}` : `Message #${state.id || "channel"}`;
}

function renderRail() {
  const b = state.bootstrap;
  els.channels.replaceChildren();
  for (const ch of b.channels) {
    const btn = document.createElement("button");
    btn.type = "button";
    const icon = ch.icon && ch.icon !== "#" ? ch.icon : "#";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = `${icon}  ${ch.title || ch.id}`;
    btn.append(label);
    const unread = unreadOf("channel", ch.id);
    const badge = badgeEl(unread);
    if (badge) btn.append(badge);
    btn.dataset.id = ch.id;
    btn.draggable = true;
    btn.className = paneShows("channel", ch.id) ? "on" : "";
    btn.onclick = () => paneOpen(state.activePane, "channel", ch.id);
    els.channels.append(btn);
  }
  renderPeople();
  renderDirect();
  renderPresence();
}

function parseDm(id) {
  const parts = String(id).split("__");
  if (parts[0] === "human") {
    return {
      withHuman: true,
      other: parts[1],
      a: "you",
      b: parts[1],
      conv: parts.slice(2).join("__"),
    };
  }
  return {
    withHuman: false,
    other: null,
    a: parts[0],
    b: parts[1],
    conv: parts.slice(2).join("__"),
  };
}

function dmHeadline(id) {
  const p = parseDm(id);
  if (p.withHuman) return displayName(p.b);
  return `${displayName(p.a)} · ${displayName(p.b)}`;
}

function dmWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = start(new Date()) - start(d);
  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dmSubline(row) {
  if (row.withHuman) {
    if (row.lastWho && row.lastWho !== "you") {
      return `${displayName(row.lastWho)} messaged you`;
    }
    return "with you";
  }
  return `${displayName(row.a)} chatted with ${displayName(row.b)}`;
}

function isWatchingDm(id) {
  return state.kind === "dm" && !parseDm(id).withHuman;
}

function latestHumanDm(botId) {
  return (state.bootstrap?.dms ?? []).find((d) => d.withHuman && d.b === botId);
}

async function openPersonDm(botId) {
  const latest = latestHumanDm(botId);
  await paneOpen(state.activePane, "dm", latest?.id || `human__${botId}`);
}

async function newPersonChat(botId) {
  const data = await (
    await api("/api/dm/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: botId }),
    })
  ).json();
  if (data.error) throw new Error(data.error);
  state.bootstrap = await (await api("/api/bootstrap")).json();
  renderRail();
  await paneOpen(state.activePane, "dm", data.id);
}

function renderDirect() {
  els.direct.replaceChildren();
  const rows = state.bootstrap?.dms ?? [];
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "desk-empty";
    empty.textContent = "No private chats yet. Open a person, or + for a new chat.";
    els.direct.append(empty);
    return;
  }
  const groups = [];
  const map = new Map();
  for (const row of rows) {
    const key = row.withHuman ? `h:${row.b}` : `b:${row.a}__${row.b}`;
    let g = map.get(key);
    if (!g) {
      g = { key, withHuman: row.withHuman, peer: row.b, a: row.a, b: row.b, chats: [] };
      map.set(key, g);
      groups.push(g);
    }
    g.chats.push(row);
  }
  for (const g of groups) {
    const box = document.createElement("div");
    box.className = "dm-group";
    const top = document.createElement("div");
    top.className = "dm-group-top";
    const who = document.createElement("button");
    who.type = "button";
    who.className = "dm-group-who";
    who.textContent = g.withHuman
      ? displayName(g.peer)
      : `${displayName(g.a)} · ${displayName(g.b)}`;
    who.onclick = () => {
      if (g.withHuman) openPersonDm(g.peer);
      else paneOpen(state.activePane, "dm", g.chats[0].id);
    };
    top.append(who);
    if (g.withHuman) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "add";
      add.title = `New chat with ${displayName(g.peer)}`;
      add.append(ico("plus"));
      add.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        newPersonChat(g.peer).catch((err) =>
          addMessage({ who: "error", text: String(err), kind: "error" }),
        );
      };
      top.append(add);
    }
    box.append(top);
    let lastDay = "";
    for (const row of g.chats) {
      const day = dmWhen(row.lastTs);
      if (day && day !== lastDay) {
        lastDay = day;
        const stamp = document.createElement("p");
        stamp.className = "dm-date";
        stamp.textContent = day;
        box.append(stamp);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dm-row";
      btn.dataset.id = row.id;
      btn.draggable = true;
      if (paneShows("dm", row.id)) btn.classList.add("on");
      const title = document.createElement("span");
      title.className = "dm-title";
      title.textContent = row.title || dmHeadline(row.id);
      const sub = document.createElement("span");
      sub.className = "dm-sub";
      sub.textContent = row.lastText
        ? String(row.lastText).replace(/\s+/g, " ").slice(0, 48)
        : "New chat";
      const col = document.createElement("span");
      col.className = "dm-col";
      col.append(title, sub);
      btn.append(col);
      const unread = unreadOf("dm", row.id);
      const badge = badgeEl(unread);
      if (badge) btn.append(badge);
      btn.onclick = () => paneOpen(state.activePane, "dm", row.id);
      box.append(btn);
    }
    els.direct.append(box);
  }
}

function renderPeople() {
  els.people.replaceChildren();
  const show = (state.bootstrap?.bots ?? []).map((b) => b.id);
  for (const id of show) {
    const face = faceFor(id);
    const wrap = document.createElement("div");
    wrap.className = "person-row";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "person";
    row.dataset.id = id;
    row.draggable = true;
    if (
      (state.panes ?? []).some((p) => {
        if (!p || p.kind !== "dm") return false;
        const parsed = parseDm(p.id);
        return parsed.withHuman && parsed.b === id;
      })
    ) {
      row.classList.add("on");
    }
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = face.glyph;
    av.style.background = face.bg;
    av.style.color = face.fg;
    const label = document.createElement("span");
    label.textContent = displayName(id);
    row.append(av, label);
    const unread = (state.bootstrap?.dms ?? [])
      .filter((d) => d.withHuman && d.b === id)
      .reduce((n, d) => n + unreadOf("dm", d.id), 0);
    const badge = badgeEl(unread);
    if (badge) row.append(badge);
    row.onclick = () => openPersonDm(id);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit";
    edit.title = `Edit @${id}`;
    edit.setAttribute("aria-label", `Edit @${id}`);
    edit.append(ico("pencil"));
    edit.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openBotSettings(id);
    };
    const del = document.createElement("button");
    del.type = "button";
    del.className = "edit del";
    del.title = `Delete @${id}`;
    del.setAttribute("aria-label", `Delete @${id}`);
    del.append(ico("trash"));
    del.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      deleteBot(id);
    };
    wrap.append(row, edit, del);
    els.people.append(wrap);
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
  let n = 0;
  for (const ch of id) n = (n * 33 + ch.charCodeAt(0)) % 360;
  const hashed = {
    glyph: (id[0] || "?").toUpperCase(),
    bg: `hsl(${n} 18% 22%)`,
    fg: `hsl(${n} 28% 78%)`,
  };
  const stock = FACES[id] ?? hashed;
  const bot = state.bootstrap?.bots?.find((b) => b.id === id);
  if (bot?.icon) return { ...stock, glyph: bot.icon };
  return stock;
}

function displayName(id) {
  if (id === "you") return "You";
  const bot = state.bootstrap?.bots?.find((b) => b.id === id);
  return bot?.name || id;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function knownPing(id) {
  if (id === "everyone" || id === "you") return true;
  return Boolean(state.bootstrap?.bots?.find((b) => b.id === id));
}

function formatCopy(text) {
  let html = escapeHtml(text);
  html = html.replace(/```[\w-]*\n([\s\S]*?)```/g, (_m, code) => `<pre class="codeblock">${code}</pre>`);
  html = html.replace(/^#{1,3} (.+)$/gm, "<strong>$1</strong>");
  html = html.replace(/^[-*] (.+)$/gm, "• $1");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(
    /(^|[^A-Za-z0-9_/])@([A-Za-z][A-Za-z0-9-]*)/g,
    (full, pre, raw) => {
      const id = raw.toLowerCase();
      if (!knownPing(id)) return full;
      const name = id === "everyone" ? "everyone" : displayName(id);
      const tip = `${name} · @${id}`;
      return `${pre}<span class="mention" data-id="${id}" data-tip="${escapeHtml(tip)}" role="link">@${id}</span>`;
    },
  );
  return html;
}

function toolLabel(name, args) {
  const a = args && typeof args === "object" ? args : {};
  if (a.path) return `${name} ${a.path}`;
  if (a.command) return `${name} ${a.command}`;
  if (a.to) return `${name} @${a.to}`;
  if (a.id && String(name).includes("create")) return `${name} ${a.id}`;
  if (a.name && name === "skill_acquire") return `${name} ${a.name}`;
  return name;
}

function setRunning(on) {
  state.running = on;
  const r = paneRoot(state.runPane);
  const send = r?.querySelector(".send");
  const stop = r?.querySelector(".stop");
  if (send) send.hidden = on;
  if (stop) stop.hidden = !on;
  if (!on) {
    state.busy.clear();
    state.activity = {};
    renderPresence();
    renderWorkChip();
  }
}

function markBusy(botId, on) {
  if (!botId) return;
  if (on) state.busy.add(botId);
  else {
    state.busy.delete(botId);
    delete state.activity[botId];
  }
  renderPresence();
  renderWorkChip();
}

function setActivity(botId, text) {
  if (!botId || botId === "you") return;
  if (text) {
    state.activity[botId] = text;
    state.busy.add(botId);
  } else {
    delete state.activity[botId];
    state.busy.delete(botId);
  }
  renderPresence();
  renderWorkChip();
}

function renderWorkChip() {
  const parts = [];
  for (const [id, text] of Object.entries(state.activity ?? {})) {
    if (!text) continue;
    parts.push(`${displayName(id)} · ${text}`);
  }
  const text = parts.join(" · ");
  for (const i of [0, 1]) {
    const el = paneRoot(i)?.querySelector(".work-chip");
    if (!el) continue;
    if (!parts.length) {
      el.hidden = true;
      el.textContent = "";
    } else {
      el.hidden = false;
      el.textContent = text;
    }
  }
}

function autoCompactKey(kind, id) {
  return `crew.autoCompact:${kind}:${id}`;
}

async function renderContextChip() {
  const keep = Number(state.bootstrap?.keep) || 80;
  for (const i of [0, 1]) {
    const pane = state.panes?.[i];
    const el = paneRoot(i)?.querySelector(".context-chip");
    if (!el) continue;
    if (!pane?.id) {
      el.textContent = `0/${keep}`;
      continue;
    }
    try {
      const q = new URLSearchParams({ kind: pane.kind, id: pane.id });
      const meta = await (await fetch(`/api/compact-status?${q}`)).json();
      const posted = Number(meta.posted) || postedOf(pane.kind, pane.id);
      const k = Number(meta.keep) || keep;
      el.textContent = meta.hasSummary ? `${posted}/${k} · compacted` : `${posted}/${k}`;
    } catch {
      el.textContent = `${postedOf(pane.kind, pane.id)}/${keep}`;
    }
  }
}

async function maybeAutoCompact(kind, id) {
  if (!kind || !id) return;
  const keep = Number(state.bootstrap?.keep) || 80;
  const posted = postedOf(kind, id);
  if (!(posted > keep * 0.7)) return;
  const flag = autoCompactKey(kind, id);
  try {
    if (sessionStorage.getItem(flag)) return;
  } catch {
    return;
  }
  try {
    const res = await fetch("/api/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    try {
      sessionStorage.setItem(flag, "1");
    } catch {
      /* quota */
    }
    if (res.ok) await renderContextChip();
  } catch {
    try {
      sessionStorage.setItem(flag, "1");
    } catch {
      /* quota */
    }
  }
}

function shortPath(p) {
  const cut = String(p).replace(/\\/g, "/").split("/").pop() || String(p);
  return cut.length > 22 ? `${cut.slice(0, 20)}…` : cut;
}

function activityLabel(name, args) {
  const a = args && typeof args === "object" ? args : {};
  if (name === "read" && a.path) return `Reading ${shortPath(a.path)}`;
  if (name === "apply_patch" && a.path) return `Editing ${shortPath(a.path)}`;
  if (name === "list_dir") return "Listing files";
  if (name === "shell" && a.command) {
    const cmd = String(a.command).trim().split(/\s+/)[0];
    return `Running ${cmd}`;
  }
  if (name === "dm_send" && a.to) return `DMing @${a.to}`;
  if (name === "skill_acquire" && a.name) return `Skill ${a.name}`;
  if (String(name).includes("create") && a.id) return `Creating ${a.id}`;
  return name;
}

function setCopy(el, text) {
  el.dataset.raw = text;
  el.innerHTML = formatCopy(text);
}

function presenceRow(id, leadId) {
  const face = faceFor(id);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "here-row";
  const doing = state.activity[id];
  if (doing) btn.classList.add("busy");
  if (state.kind === "dm" && state.id === `human__${id}`) btn.classList.add("on");
  const avWrap = document.createElement("span");
  avWrap.className = "here-av";
  const av = document.createElement("span");
  av.className = "avatar";
  av.textContent = face.glyph;
  av.style.background = face.bg;
  av.style.color = face.fg;
  const dot = document.createElement("span");
  dot.className = "here-dot";
  avWrap.append(av, dot);
  const meta = document.createElement("span");
  meta.className = "here-meta";
  const name = document.createElement("span");
  name.className = "name";
  name.append(document.createTextNode(displayName(id)));
  if (leadId && id === leadId) {
    const role = document.createElement("span");
    role.className = "lead-mark";
    role.textContent = "lead";
    name.append(role);
  }
  meta.append(name);
  const line = document.createElement("span");
  line.className = "here-activity";
  line.textContent = doing || "Online";
  meta.append(line);
  btn.append(avWrap, meta);
  btn.onclick = () => paneOpen(state.activePane, "dm", `human__${id}`);
  return btn;
}

function renderPresence() {
  els.hereList.replaceChildren();
  const bots = state.bootstrap?.bots ?? [];
  let hereIds = [];
  let leadId = null;
  if (state.kind === "channel") {
    const ch = currentChannel();
    hereIds = ch?.memberBotIds ?? [];
    leadId = ch?.leadBotId ?? null;
    if (els.deskLabel) els.deskLabel.textContent = `Members — ${hereIds.length}`;
  } else {
    const dm = parseDm(state.id);
    hereIds = dm.withHuman ? [dm.b] : [dm.a, dm.b].filter(Boolean);
    if (els.deskLabel) els.deskLabel.textContent = "Online";
  }
  const byId = new Map(bots.map((b) => [b.id, b]));
  for (const id of hereIds) {
    if (!byId.has(id)) continue;
    els.hereList.append(presenceRow(id, leadId));
  }
  if (!els.hereList.children.length) {
    const empty = document.createElement("p");
    empty.className = "desk-empty";
    empty.textContent = "No members.";
    els.hereList.append(empty);
  }
}

function startTurn(id, kind) {
  const isYou = id === "you";
  const face = faceFor(id);
  const li = document.createElement("li");
  li.className = `msg ${isYou ? "you" : "bot"}`;
  if (kind === "error") li.classList.add("error");

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = face.glyph;
  avatar.style.background = face.bg;
  avatar.style.color = face.fg;
  avatar.title = isYou ? "You" : `${displayName(id)} · @${id}`;

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

  const think = document.createElement("details");
  think.className = "fold think";
  think.hidden = true;
  const thinkSum = document.createElement("summary");
  thinkSum.textContent = "Thinking";
  const thinkBody = document.createElement("pre");
  thinkBody.className = "fold-body";
  think.append(thinkSum, thinkBody);

  const tools = document.createElement("details");
  tools.className = "fold tools";
  tools.hidden = true;
  const toolsSum = document.createElement("summary");
  toolsSum.textContent = "Tools";
  const toolList = document.createElement("ul");
  toolList.className = "fold-tools";
  tools.append(toolsSum, toolList);

  const copy = document.createElement("p");
  copy.className = "copy";
  copy.dataset.raw = "";

  if (isYou || kind === "error") col.append(whoEl, copy);
  else col.append(whoEl, think, tools, copy);
  li.append(avatar, col);
  els.log.append(li);
  const turn = {
    botId: id,
    sealed: isYou || kind === "error",
    li,
    copy,
    think,
    thinkBody,
    tools,
    toolsSum,
    toolList,
    toolCount: 0,
  };
  currentTurn = turn;
  pinBottom();
  return turn;
}

function ensureTurn(botId) {
  if (currentTurn && currentTurn.botId !== botId) currentTurn.sealed = true;
  if (currentTurn && currentTurn.botId === botId && !currentTurn.sealed) {
    return currentTurn;
  }
  return startTurn(botId);
}

function appendAccount(botId, text, seal) {
  const turn = ensureTurn(botId);
  setCopy(turn.copy, (turn.copy.dataset.raw || "") + text);
  if (seal) {
    turn.sealed = true;
    if (state.running) setActivity(botId, null);
  } else if (state.running) {
    setActivity(botId, "Writing");
  }
  pinBottom();
  return turn.copy;
}

function appendThinking(botId, text) {
  if (!text) return;
  if (state.running) setActivity(botId, "Thinking");
  const turn = ensureTurn(botId);
  turn.think.hidden = false;
  turn.thinkBody.textContent += text;
  pinBottom();
}

function appendTool(botId, name, args) {
  if (!name) return;
  if (state.running) setActivity(botId, activityLabel(name, args));
  const turn = ensureTurn(botId);
  turn.tools.hidden = false;
  turn.toolCount += 1;
  turn.toolsSum.textContent = turn.toolCount === 1 ? "1 tool" : `${turn.toolCount} tools`;
  const li = document.createElement("li");
  li.textContent = toolLabel(name, args);
  turn.toolList.append(li);
  pinBottom();
}

function shortenChatError(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return raw;
  const jsonAt = raw.indexOf("{");
  if (jsonAt >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonAt));
      const who = parsed.error?.metadata?.provider_name;
      if (parsed.error?.code === 429 || /rate-limit/i.test(raw)) {
        return `429 rate-limited${who ? ` via ${who}` : ""}. Free shared pool is full. Wait 30–60s, tag one bot, or switch model.`;
      }
      const msg = parsed.error?.message;
      if (typeof msg === "string" && msg.trim()) {
        return `${raw.slice(0, jsonAt).trim()} ${msg}`.trim().slice(0, 220);
      }
    } catch {
      /* not JSON */
    }
  }
  if (/429|rate-limit/i.test(raw)) {
    return "429 rate-limited. Free shared pool is full. Wait 30–60s, tag one bot, or switch model.";
  }
  if (jsonAt >= 0) return raw.replace(/\s+/g, " ").slice(0, 220);
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}

function addMessage({ who, botId, text, kind }) {
  const id = botIdFromWho(who, botId);
  if (id === "you" || kind === "error") {
    const turn = startTurn(id, kind);
    setCopy(turn.copy, kind === "error" ? shortenChatError(text) : text);
    if (kind === "error" && state.lastPrompt && state.kind === "channel") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "retry";
      retry.textContent = "Retry";
      retry.onclick = () => {
        els.draft.value = state.lastPrompt;
        els.form.requestSubmit();
      };
      turn.copy.append(retry);
    }
    currentTurn = null;
    return turn.copy;
  }
  return appendAccount(id, text, true);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res;
}

function setRailOpen(on) {
  document.querySelector(".rail")?.classList.toggle("open", on);
  const scrim = document.getElementById("nav-scrim");
  if (scrim) scrim.hidden = !on;
}

async function openThread(kind, id) {
  setRailOpen(false);
  state.kind = kind;
  state.id = id;
  if (kind === "channel") {
    if (els.kicker) els.kicker.textContent = "channel";
    const ch = state.bootstrap.channels.find((c) => c.id === id);
    const icon = ch?.icon && ch.icon !== "#" ? ch.icon : "#";
    if (els.title) els.title.textContent = `${icon} ${ch?.title || id}`;
  } else {
    const dm = parseDm(id);
    if (els.kicker) {
      els.kicker.textContent = dm.withHuman ? "with you" : dmSubline({ withHuman: false, a: dm.a, b: dm.b });
    }
    if (els.title) els.title.textContent = dmHeadline(id);
  }
  syncTitleRegen();
  syncModeChip();
  setDraftPlaceholder();
  markRead(kind, id);
  renderRail();
  renderPinStrip();
  const q = new URLSearchParams({
    kind,
    id,
    thinking: "1",
    verbose: "1",
  });
  const rows = await (await api(`/api/thread?${q}`)).json();
  // Loading the other pane must not abort the in-flight NDJSON turn.
  const keepRun = Boolean(state.running && state.activePane !== state.runPane);
  const savedTurn = keepRun ? currentTurn : null;
  const savedBusy = keepRun ? new Set(state.busy) : null;
  const savedActivity = keepRun ? { ...state.activity } : null;
  els.log?.replaceChildren();
  currentTurn = null;
  const cut = clearedAt(kind, id);
  for (const row of rows) {
    if (cut && row.ts && row.ts < cut) continue;
    if (row.type === "message") {
      addMessage({ who: row.who, botId: row.botId, text: row.text });
    } else if (row.type === "thinking") {
      appendThinking(row.botId, row.text);
    } else if (row.type === "tool") {
      appendTool(row.botId, row.name, row.args);
    } else if (row.type === "error") {
      addMessage({
        who: `@${row.botId}`,
        botId: row.botId,
        text: row.text,
        kind: "error",
      });
    }
  }
  if (currentTurn) currentTurn.sealed = true;
  if (keepRun) {
    currentTurn = savedTurn;
    state.busy = savedBusy;
    state.activity = savedActivity;
  } else {
    state.busy.clear();
    state.activity = {};
  }
  renderPresence();
  renderWorkChip();
  renderContextChip();
  applySearch();
  pinBottom();
  setTimeout(pinBottom, 50);
}

function paintFace(el, glyph, id) {
  const face = faceFor(id);
  el.textContent = glyph || face.glyph;
  el.style.background = face.bg;
  el.style.color = face.fg;
}

const ICONS = ["λ","◆","✦","※","▣","●","▲","■","★","⚙","✎","⌂","⚑","◎","◇","△","▶","⌘","∞","#","@","Σ","Ω","μ","π","◉"];
const iconPickers = {};

function bindIconPicker(kind, fallback) {
  const hidden = document.getElementById(`${kind}-icon`);
  const btn = document.getElementById(`${kind}-icon-btn`);
  const menu = document.getElementById(`${kind}-icon-menu`);
  const face = document.getElementById(`${kind}-face`);
  function currentId() {
    return kind === "bot" ? state.editBotId : (state.editChannelId || state.id);
  }
  function set(value) {
    const v = (value ?? "").trim();
    hidden.value = v;
    btn.textContent = v || "Auto";
    paintFace(face, v || fallback, currentId());
    for (const b of menu.querySelectorAll("button")) {
      b.classList.toggle("on", (b.dataset.icon || "") === v);
    }
  }
  menu.replaceChildren();
  const auto = document.createElement("button");
  auto.type = "button";
  auto.dataset.icon = "";
  auto.textContent = "A";
  auto.title = "Auto";
  auto.onclick = () => {
    set("");
    menu.hidden = true;
  };
  menu.append(auto);
  for (const g of ICONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.icon = g;
    b.textContent = g;
    b.onclick = () => {
      set(g);
      menu.hidden = true;
    };
    menu.append(b);
  }
  btn.onclick = (ev) => {
    ev.preventDefault();
    const open = menu.hidden;
    document.querySelectorAll(".icon-dd-menu").forEach((m) => {
      m.hidden = true;
    });
    menu.hidden = !open;
  };
  iconPickers[kind] = { set };
}

bindIconPicker("ch", "#");
bindIconPicker("bot", "");

function skillPreview() {
  const name = document
    .getElementById("skill-name")
    .value.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const desc = document.getElementById("skill-desc").value.trim();
  const body = document.getElementById("skill-body").value.replace(/\s+$/, "");
  document.getElementById("skill-preview").textContent =
    `---\nname: ${name || "…"}\ndescription: ${JSON.stringify(desc || "…")}\n---\n\n${body || "… "}\n`;
}

function setSkillEdit(name) {
  state.editSkillName = name || "";
  setBtnText("skill-save", name ? "Save skill" : "Add skill");
  document.getElementById("skill-delete").hidden = !name;
  skillPreview();
}

function clearSkillForm() {
  document.getElementById("skill-name").value = "";
  document.getElementById("skill-desc").value = "";
  document.getElementById("skill-body").value = "";
  setSkillEdit("");
}

function setSkillOpenEnabled(on) {
  const btn = document.getElementById("skill-open");
  const hint = document.getElementById("skill-open-hint");
  btn.disabled = !on;
  hint.hidden = on;
}

function openSkillSheet(existing) {
  const id = state.editBotId;
  document.getElementById("skill-bot-label").textContent = existing
    ? `@${id} · ${existing}`
    : `@${id} · new`;
  els.skillModal.showModal();
  skillPreview();
  document.getElementById("skill-name").focus();
}

function renderSkills(skills) {
  const list = document.getElementById("bot-skills");
  list.replaceChildren();
  if (!skills?.length) {
    const empty = document.createElement("li");
    empty.className = "desk-empty";
    empty.textContent = "No skills yet.";
    list.append(empty);
    return;
  }
  for (const s of skills) {
    const li = document.createElement("li");
    li.className = "skill-card";
    const copy = document.createElement("div");
    copy.className = "skill-copy";
    const name = document.createElement("strong");
    name.textContent = s.name;
    const desc = document.createElement("span");
    desc.textContent = s.description || "";
    copy.append(name, desc);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "edit del";
    del.title = `Delete ${s.name}`;
    del.setAttribute("aria-label", `Delete ${s.name}`);
    del.append(ico("trash"));
    del.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      deleteSkill(s.name);
    };
    li.append(copy, del);
    li.onclick = async () => {
      try {
        const skill = await (
          await api(`/api/bot/${state.editBotId}/skills/${encodeURIComponent(s.name)}`)
        ).json();
        document.getElementById("skill-name").value = skill.name ?? s.name;
        document.getElementById("skill-desc").value = skill.description ?? s.description ?? "";
        document.getElementById("skill-body").value = skill.body ?? "";
        setSkillEdit(skill.name ?? s.name);
        openSkillSheet(skill.name ?? s.name);
      } catch (err) {
        addMessage({ who: "error", text: String(err), kind: "error" });
      }
    };
    list.append(li);
  }
}

function setRosterLead(id) {
  const roster = document.getElementById("ch-roster");
  for (const row of roster.children) {
    const isLead = row.dataset.id === id;
    row.querySelector(".roster-lead").classList.toggle("on", isLead);
    if (isLead) row.classList.add("on");
  }
}

function fillRoster(memberBotIds, leadBotId) {
  const roster = document.getElementById("ch-roster");
  roster.replaceChildren();
  for (const bot of state.bootstrap.bots) {
    const id = bot.id;
    const face = faceFor(id);
    const row = document.createElement("div");
    row.className = "roster-row";
    row.dataset.id = id;
    if (memberBotIds.includes(id)) row.classList.add("on");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "roster-toggle";
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = face.glyph;
    av.style.background = face.bg;
    av.style.color = face.fg;
    const nameWrap = document.createElement("span");
    nameWrap.className = "roster-name";
    nameWrap.append(document.createTextNode(displayName(id)));
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `@${id}`;
    nameWrap.append(tag);
    toggle.append(av, nameWrap);
    toggle.onclick = () => {
      const next = !row.classList.contains("on");
      if (!next && row.querySelector(".roster-lead.on")) return;
      row.classList.toggle("on", next);
    };
    const leadBtn = document.createElement("button");
    leadBtn.type = "button";
    leadBtn.className = "roster-lead";
    leadBtn.textContent = "lead";
    if (id === leadBotId) leadBtn.classList.add("on");
    leadBtn.onclick = () => setRosterLead(id);
    row.append(toggle, leadBtn);
    roster.append(row);
  }
}

function readRoster() {
  const rows = [...document.querySelectorAll("#ch-roster .roster-row")];
  const memberBotIds = rows.filter((r) => r.classList.contains("on")).map((r) => r.dataset.id);
  const lead = rows.find((r) => r.querySelector(".roster-lead.on"));
  return { memberBotIds, leadBotId: lead?.dataset.id ?? memberBotIds[0] ?? "" };
}

function fillBotRooms(botId, editable) {
  const box = document.getElementById("bot-rooms");
  if (!box) return;
  box.replaceChildren();
  box.classList.toggle("locked", !editable);
  const hint = document.getElementById("bot-rooms-hint");
  if (hint) hint.hidden = !!editable;
  for (const ch of state.bootstrap?.channels ?? []) {
    const row = document.createElement("div");
    row.className = "roster-row";
    row.dataset.id = ch.id;
    if ((ch.memberBotIds ?? []).includes(botId)) row.classList.add("on");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "roster-toggle";
    toggle.textContent = `#${ch.title || ch.id}`;
    if (editable) {
      toggle.onclick = () => row.classList.toggle("on");
    } else {
      toggle.disabled = true;
    }
    row.append(toggle);
    box.append(row);
  }
}

function readBotRooms() {
  return [...document.querySelectorAll("#bot-rooms .roster-row.on")].map((r) => r.dataset.id);
}

let chPaths = [];

function renderChPaths() {
  const list = document.getElementById("ch-paths");
  if (!list) return;
  list.replaceChildren();
  for (const p of chPaths) {
    const li = document.createElement("li");
    const t = document.createElement("span");
    t.textContent = p;
    const x = document.createElement("button");
    x.type = "button";
    x.append(ico("x"));
    x.setAttribute("aria-label", "Remove path");
    x.onclick = () => {
      chPaths = chPaths.filter((q) => q !== p);
      renderChPaths();
    };
    li.append(t, x);
    list.append(li);
  }
}

function addChPath(raw) {
  const n = String(raw || "").replace(/\\/g, "/").trim();
  if (!n || chPaths.includes(n)) return;
  chPaths.push(n);
  renderChPaths();
}

function randomId(prefix) {
  const used = new Set([
    ...(state.bootstrap?.bots ?? []).map((b) => b.id),
    ...(state.bootstrap?.channels ?? []).map((c) => c.id),
    "human",
    "you",
    "everyone",
    "engine",
  ]);
  for (let i = 0; i < 24; i++) {
    const id = `${prefix}${Math.random().toString(36).slice(2, 7)}`;
    if (!used.has(id) && /^[a-z][a-z0-9-]*$/.test(id)) return id;
  }
  return `${prefix}${Date.now().toString(36).slice(-5)}`;
}

async function openChannelSettings() {
  try {
    const id = state.kind === "channel" ? state.id : state.bootstrap.channels[0]?.id;
    if (!id) throw new Error("no channel to edit");
    const data = await (await api(`/api/channel/${id}`)).json();
    state.editChannelId = id;
    const icon = data.icon === "#" ? "" : (data.icon ?? "");
    document.getElementById("ch-id").value = `#${id}`;
    document.getElementById("ch-icon").value = icon;
    iconPickers.ch?.set(icon);
    document.getElementById("ch-title").value = data.title ?? "";
    document.getElementById("ch-context").value = data.context ?? "";
    document.getElementById("ch-rules").value = data.rules ?? "";
    chPaths = [...(data.folders ?? [])];
    renderChPaths();
    document.getElementById("ch-mode").value = data.permissionMode || "auto-accept";
    paintFace(document.getElementById("ch-face"), icon || "#", id);
    fillRoster(data.memberBotIds ?? [], data.leadBotId);
    document.getElementById("ch-delete").hidden = false;
    state.creating = "";
    els.channelModal.showModal();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

async function openBotSettings(id) {
  try {
    state.editBotId = id;
    const data = await (await api(`/api/bot/${id}`)).json();
    document.getElementById("bot-id").value = `@${id}`;
    document.getElementById("bot-icon").value = data.icon ?? "";
    iconPickers.bot?.set(data.icon ?? "");
    document.getElementById("bot-name").value = data.name ?? "";
    document.getElementById("bot-soul").value = data.soul ?? "";
    document.getElementById("bot-orders").value = data.standingOrders ?? "";
    fillModelSelect(document.getElementById("bot-model"), data.model, "workspace default");
    fillModelSelect(document.getElementById("bot-fallback"), data.fallbackModel, "workspace fallback");
    paintFace(document.getElementById("bot-face"), data.icon, id);
    renderSkills(data.skills ?? []);
    clearSkillForm();
    setSkillOpenEnabled(true);
    fillBotRooms(id, false);
    document.getElementById("bot-delete").hidden = false;
    state.creating = "";
    els.botModal.showModal();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

async function deleteBot(id) {
  if (!id) return;
  if (!confirm(`Delete @${id}? Logs stay.`)) return;
  try {
    await api(`/api/bot/${id}`, { method: "DELETE" });
    els.botModal.close();
    state.bootstrap = await (await api("/api/bootstrap")).json();
    const lost = state.kind === "dm" && state.id.split("__").includes(id);
    state.editBotId = "";
    if (lost) {
      const first = state.bootstrap.channels[0];
      if (first) await paneOpen(state.activePane, "channel", first.id);
      else {
        state.id = "";
        els.log?.replaceChildren();
        renderRail();
      }
    } else renderRail();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

async function deleteChannel(id) {
  if (!id) return;
  if (!confirm(`Delete #${id}? Logs stay.`)) return;
  try {
    await api(`/api/channel/${id}`, { method: "DELETE" });
    els.channelModal.close();
    const was = state.kind === "channel" && state.id === id;
    state.bootstrap = await (await api("/api/bootstrap")).json();
    if (was) {
      const first = state.bootstrap.channels[0];
      if (first) await paneOpen(state.activePane, "channel", first.id);
      else {
        state.id = "";
        els.log?.replaceChildren();
        renderRail();
      }
    } else renderRail();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

async function renderAlways() {
  const list = document.getElementById("always-list");
  if (!list) return;
  try {
    const data = await (await api("/api/permissions")).json();
    list.replaceChildren();
    const rules = data.rules ?? [];
    if (!rules.length) {
      const empty = document.createElement("li");
      empty.className = "desk-empty";
      empty.textContent = "No always rules.";
      list.append(empty);
      return;
    }
    for (const r of rules) {
      const li = document.createElement("li");
      li.className = "skill-card";
      li.style.cursor = "default";
      const name = document.createElement("strong");
      name.textContent = r.tool;
      const desc = document.createElement("span");
      desc.textContent = r.key;
      li.append(name, desc);
      list.append(li);
    }
  } catch (err) {
    list.textContent = String(err);
  }
}

document.getElementById("ch-cancel").onclick = () => els.channelModal.close();
document.getElementById("bot-cancel").onclick = () => els.botModal.close();
document.getElementById("ch-delete").onclick = () =>
  deleteChannel(state.editChannelId || state.id);
document.getElementById("bot-delete").onclick = () => deleteBot(state.editBotId);

const helpTip = document.createElement("div");
helpTip.className = "help-tip";
helpTip.id = "help-tip";
helpTip.setAttribute("role", "tooltip");
helpTip.setAttribute("popover", "manual");
document.body.append(helpTip);

let helpBtn = null;
let helpTimer = 0;
let helpArmed = true;

function hideHelpTip() {
  clearTimeout(helpTimer);
  helpTimer = 0;
  helpBtn = null;
  if (helpTip.matches(":popover-open")) {
    try {
      helpTip.hidePopover();
    } catch {
      /* ignore */
    }
  }
}

function freezeHelp() {
  helpArmed = false;
  hideHelpTip();
  const ae = document.activeElement;
  if (ae?.classList?.contains("help")) ae.blur();
}

function placeHelpTip(btn) {
  const tip = btn.dataset.tip;
  if (!tip) return;
  helpTip.textContent = tip;
  try {
    if (!helpTip.matches(":popover-open")) helpTip.showPopover();
  } catch {
    return;
  }
  const r = btn.getBoundingClientRect();
  const pad = 8;
  const tw = helpTip.offsetWidth;
  const th = helpTip.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + tw > innerWidth - pad) left = innerWidth - tw - pad;
  if (left < pad) left = pad;
  if (top + th > innerHeight - pad) top = r.top - th - 6;
  if (top < pad) top = pad;
  helpTip.style.left = `${Math.round(left)}px`;
  helpTip.style.top = `${Math.round(top)}px`;
}

document.addEventListener(
  "pointermove",
  (ev) => {
    const was = helpArmed;
    helpArmed = true;
    if (was) return;
    const btn = ev.target.closest?.(".help");
    if (btn) {
      helpBtn = btn;
      placeHelpTip(btn);
    }
  },
  { passive: true },
);

document.addEventListener("pointerover", (ev) => {
  if (!helpArmed) return;
  const btn = ev.target.closest?.(".help");
  if (!btn || btn === helpBtn) return;
  helpBtn = btn;
  clearTimeout(helpTimer);
  helpTimer = setTimeout(() => {
    if (helpArmed && helpBtn === btn) placeHelpTip(btn);
  }, 60);
});

document.addEventListener("pointerout", (ev) => {
  const btn = ev.target.closest?.(".help");
  if (!btn || btn.contains(ev.relatedTarget)) return;
  if (helpBtn === btn) hideHelpTip();
});

document.addEventListener(
  "scroll",
  () => {
    if (helpBtn) hideHelpTip();
  },
  true,
);

document.querySelectorAll(".help").forEach((b) => {
  b.tabIndex = -1;
});

document.querySelectorAll("dialog").forEach((dlg) => {
  dlg.addEventListener("close", hideHelpTip);
  const show = dlg.showModal.bind(dlg);
  dlg.showModal = function showModalQuiet() {
    freezeHelp();
    closeMenu();
    const ret = show();
    queueMicrotask(freezeHelp);
    setTimeout(freezeHelp, 0);
    return ret;
  };
});

document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".icon-dd")) {
    document.querySelectorAll(".icon-dd-menu").forEach((m) => {
      m.hidden = true;
    });
  }
});

document.getElementById("channel-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = state.editChannelId || state.id;
  const { memberBotIds, leadBotId } = readRoster();
  const payload = {
    icon: document.getElementById("ch-icon").value.trim(),
    title: document.getElementById("ch-title").value.trim() || id,
    leadBotId,
    memberBotIds,
    context: document.getElementById("ch-context").value,
    rules: document.getElementById("ch-rules").value,
    folders: chPaths,
    permissionMode: document.getElementById("ch-mode").value,
  };
  try {
    if (state.creating === "channel") {
      await api("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
    } else {
      await api(`/api/channel/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (state.kind === "channel" && state.id === id) {
        await api("/api/mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: id, mode: payload.permissionMode }),
        });
      }
    }
    els.channelModal.close();
    state.creating = "";
    state.bootstrap = await (await api("/api/bootstrap")).json();
    await paneOpen(state.activePane, "channel", id);
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
});

document.getElementById("bot-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = state.editBotId;
  const patch = {
    icon: document.getElementById("bot-icon").value.trim(),
    name: document.getElementById("bot-name").value.trim() || id,
    soul: document.getElementById("bot-soul").value,
    standingOrders: document.getElementById("bot-orders").value,
    model: document.getElementById("bot-model").value,
    fallbackModel: document.getElementById("bot-fallback").value,
  };
  try {
    if (state.creating === "person") {
      await api("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: patch.name, soul: patch.soul, icon: patch.icon }),
      });
    }
    await api(`/api/bot/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (state.creating === "person") {
      const rooms = new Set(readBotRooms());
      for (const ch of state.bootstrap?.channels ?? []) {
        const has = (ch.memberBotIds ?? []).includes(id);
        const want = rooms.has(ch.id);
        if (has === want) continue;
        const memberBotIds = want
          ? [...(ch.memberBotIds ?? []), id]
          : (ch.memberBotIds ?? []).filter((x) => x !== id);
        await api(`/api/channel/${ch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberBotIds }),
        });
      }
    }
    els.botModal.close();
    state.creating = "";
    state.bootstrap = await (await api("/api/bootstrap")).json();
    renderRail();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
});

async function deleteSkill(name) {
  const id = state.editBotId;
  if (!id || !name) return;
  if (!confirm(`Delete skill ${name}? The SKILL.md is removed.`)) return;
  try {
    const data = await (await api(`/api/bot/${id}/skills/${encodeURIComponent(name)}`, { method: "DELETE" })).json();
    renderSkills(data.skills ?? []);
    if (state.editSkillName === name) clearSkillForm();
    if (els.skillModal.open) els.skillModal.close();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

async function saveSkill() {
  const id = state.editBotId;
  const name = document.getElementById("skill-name").value.trim();
  if (!id || !name) return;
  try {
    const data = await (
      await api(`/api/bot/${id}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: document.getElementById("skill-desc").value.trim(),
          body: document.getElementById("skill-body").value,
        }),
      })
    ).json();
    const was = state.editSkillName;
    const next = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (was && next && was !== next) {
      await api(`/api/bot/${id}/skills/${encodeURIComponent(was)}`, { method: "DELETE" }).catch(() => {});
      const fresh = await (await api(`/api/bot/${id}`)).json();
      renderSkills(fresh.skills ?? []);
    } else {
      renderSkills(data.skills ?? []);
    }
    clearSkillForm();
    if (els.skillModal.open) els.skillModal.close();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

document.getElementById("skill-open").addEventListener("click", () => {
  if (document.getElementById("skill-open").disabled) return;
  clearSkillForm();
  openSkillSheet("");
});
document.getElementById("skill-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  saveSkill();
});
document.getElementById("skill-delete").addEventListener("click", () => {
  deleteSkill(state.editSkillName);
});
els.botModal.addEventListener("close", () => {
  if (els.skillModal.open) els.skillModal.close();
});
for (const id of ["skill-name", "skill-desc", "skill-body"]) {
  document.getElementById(id).addEventListener("input", skillPreview);
}

async function onWatch() {
  try {
    const prev = state.bootstrap?.posted ?? {};
    const boot = await (await api("/api/bootstrap")).json();
    state.bootstrap = boot;
    renderRail();
    if (state.running) return;
    const stay = state.activePane;
    for (let i = 0; i < 2; i++) {
      const p = state.panes[i];
      if (!p?.id) continue;
      const key = threadKey(p.kind, p.id);
      if ((boot.posted?.[key] ?? 0) !== (prev[key] ?? 0)) {
        state.activePane = i;
        bindPane(i);
        await openThread(p.kind, p.id);
      }
    }
    if (state.panes[stay]) {
      state.activePane = stay;
      bindPane(stay);
      state.kind = state.panes[stay].kind;
      state.id = state.panes[stay].id;
    }
  } catch {
    /* office still usable offline of the watch */
  }
}

function startWatch() {
  const es = new EventSource("/api/watch");
  es.onmessage = () => {
    onWatch();
  };
  es.onerror = () => {
    /* EventSource retries */
  };
}

document.getElementById("nav-scrim")?.addEventListener("click", () => setRailOpen(false));

async function restoreSplit() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem("crew.split") || "null");
  } catch {
    saved = null;
  }
  if (!saved || (saved.split !== "right" && saved.split !== "below")) return;
  const primary = saved.panes?.[0];
  const extra = saved.panes?.[1];
  if (primary && threadStillExists(primary.kind, primary.id)) {
    await paneOpen(0, primary.kind, primary.id);
  }
  if (extra && threadStillExists(extra.kind, extra.id)) {
    await splitOpen(extra.kind, extra.id, saved.split);
  } else {
    closeSplit();
  }
}

async function boot() {
  state.bootstrap = await (await api("/api/bootstrap")).json();
  renderRail();
  const first = state.bootstrap.channels[0];
  if (first) await paneOpen(0, "channel", first.id);
  await restoreSplit();
  startWatch();
}

document.getElementById("mode-close").onclick = () => els.modeModal.close();
document.getElementById("mode-list").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-mode]");
  if (!btn || state.kind !== "channel") return;
  const mode = btn.dataset.mode;
  try {
    await api("/api/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: state.id, mode }),
    });
    const ch = currentChannel();
    if (ch) ch.permissionMode = mode;
    syncModeChip();
    els.modeModal.close();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
});

function renderAllowedChips() {
  const box = document.getElementById("allowed-chips");
  box.replaceChildren();
  for (const id of allowedModels()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${id}  ×`;
    btn.title = "Remove";
    btn.onclick = () => {
      persistAllowed(allowedModels().filter((x) => x !== id));
    };
    box.append(btn);
  }
}

function fillSettingsSelects() {
  fillModelSelect(
    document.getElementById("app-default-model"),
    state.bootstrap.model,
    "pick a model",
  );
  fillModelSelect(
    document.getElementById("app-fallback-model"),
    state.bootstrap.fallbackModel,
    "none",
  );
}

const JOB_KEYS = ["title", "compact", "vision", "read"];

function fillBotSelect(select, current) {
  if (!select) return;
  const bots = state.bootstrap?.bots ?? [];
  select.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "(none)";
  select.append(none);
  for (const b of bots) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name || b.id;
    select.append(opt);
  }
  select.value = current || "";
}

async function fillJobs() {
  let jobs = {
    title: { model: "", botId: null },
    compact: { model: "", botId: null },
    vision: { model: "", botId: null },
    read: { model: "", botId: null },
  };
  try {
    jobs = await (await api("/api/jobs")).json();
  } catch {
    /* defaults */
  }
  for (const key of JOB_KEYS) {
    const blank = key === "vision" || key === "read" ? "Off" : "Default";
    fillModelSelect(document.getElementById(`job-${key}-model`), jobs[key]?.model ?? "", blank);
    fillBotSelect(document.getElementById(`job-${key}-bot`), jobs[key]?.botId ?? "");
  }
}

async function persistJobs() {
  const body = {};
  for (const key of JOB_KEYS) {
    const model = document.getElementById(`job-${key}-model`)?.value ?? "";
    const botId = document.getElementById(`job-${key}-bot`)?.value || null;
    body[key] = { model, botId };
  }
  await api("/api/jobs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function syncTitleRegen() {
  for (const i of [0, 1]) {
    const btn = paneRoot(i)?.querySelector(".title-regen");
    if (!btn) continue;
    const pane = state.panes?.[i];
    const show = pane?.kind === "dm" && pane.id && parseDm(pane.id).withHuman;
    btn.hidden = !show;
  }
}

async function regenerateTitle() {
  if (state.kind !== "dm" || !state.id) return;
  try {
    const res = await (
      await api("/api/thread-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "dm", id: state.id }),
      })
    ).json();
    if (res.error) throw new Error(res.error);
    state.bootstrap = await (await api("/api/bootstrap")).json();
    renderRail();
    toast("Title updated.");
  } catch (err) {
    toast(String(err));
  }
}

async function persistAllowed(ids) {
  const res = await (
    await api("/api/allowed-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
  ).json();
  state.bootstrap.models = res.models;
  renderAllowedChips();
  fillSettingsSelects();
}

async function loadCatalog(q) {
  const box = document.getElementById("catalog");
  const query = String(q || "").trim();
  if (query.length < 2) {
    box.textContent = "Type 2+ characters to search OpenRouter.";
    return;
  }
  box.textContent = "Searching…";
  try {
    const res = await (await api(`/api/models?q=${encodeURIComponent(query)}`)).json();
    box.replaceChildren();
    for (const m of res.models ?? []) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "catalog-row";
      if (allowedModels().includes(m.id)) row.classList.add("on");
      const col = document.createElement("span");
      col.className = "catalog-copy";
      const h = document.createElement("strong");
      h.textContent = m.name || m.id;
      const id = document.createElement("span");
      id.className = "id";
      id.textContent = m.id;
      col.append(h, id);
      const allow = document.createElement("span");
      allow.className = "allow";
      allow.textContent = allowedModels().includes(m.id) ? "on" : "add";
      row.append(col, allow);
      row.onclick = () => {
        const have = allowedModels().includes(m.id);
        persistAllowed(have ? allowedModels().filter((x) => x !== m.id) : [...allowedModels(), m.id]);
        row.classList.toggle("on", !have);
        allow.textContent = have ? "add" : "on";
      };
      box.append(row);
    }
    if (!box.children.length) box.textContent = "No models match.";
  } catch (err) {
    box.textContent = String(err);
  }
}

async function openAppSettings() {
  document.getElementById("app-key-meta").textContent = state.bootstrap.keySet
    ? `saved ${state.bootstrap.key}`
    : "not set";
  document.getElementById("app-key").value = "";
  fillSettingsSelects();
  renderAllowedChips();
  fillJobs();
  renderAlways();
  els.appModal.showModal();
  document.getElementById("model-search").value = "";
  loadCatalog("");
}

els.appSettings.addEventListener("click", () => openAppSettings());
document.getElementById("app-close").onclick = () => els.appModal.close();
document.getElementById("app-form").addEventListener("submit", (ev) => ev.preventDefault());
document.getElementById("app-key-save").addEventListener("click", async () => {
  const apiKey = document.getElementById("app-key").value.trim();
  if (!apiKey) return;
  try {
    const res = await (
      await api("/api/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      })
    ).json();
    state.bootstrap.key = res.key;
    state.bootstrap.keySet = true;
    document.getElementById("app-key").value = "";
    document.getElementById("app-key-meta").textContent = `saved ${res.key}`;
    loadCatalog(document.getElementById("model-search").value);
  } catch (err) {
    document.getElementById("app-key-meta").textContent = String(err);
  }
});
document.getElementById("app-default-model").addEventListener("change", async (ev) => {
  const model = ev.target.value;
  if (!model) return;
  const res = await (
    await api("/api/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    })
  ).json();
  state.bootstrap.model = res.model;
});
for (const key of ["title", "compact", "vision", "read"]) {
  document.getElementById(`job-${key}-model`)?.addEventListener("change", () => {
    persistJobs().catch((err) => toast(String(err)));
  });
  document.getElementById(`job-${key}-bot`)?.addEventListener("change", () => {
    persistJobs().catch((err) => toast(String(err)));
  });
}
document.getElementById("app-fallback-model").addEventListener("change", async (ev) => {
  const res = await (
    await api("/api/fallback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ev.target.value }),
    })
  ).json();
  state.bootstrap.fallbackModel = res.fallbackModel;
});
let catalogTimer = 0;
document.getElementById("model-search").addEventListener("input", (ev) => {
  clearTimeout(catalogTimer);
  catalogTimer = setTimeout(() => loadCatalog(ev.target.value), 250);
});

function onDraftInput() {
  if (!els.draft) return;
  els.draft.style.height = "auto";
  els.draft.style.height = `${Math.min(els.draft.scrollHeight, 160)}px`;
  renderPalette();
}

function onDraftKeydown(ev) {
  if (!els.draft) return;
  if (ev.isComposing || ev.keyCode === 229) return;
  if (ev.key === "Escape") {
    hidePalette();
    if (state.running) api("/api/stop", { method: "POST" }).catch(() => {});
    return;
  }
  if ((ev.key === "ArrowDown" || ev.key === "ArrowUp") && els.palette && !els.palette.hidden) {
    const buttons = [...els.palette.querySelectorAll("button")];
    if (!buttons.length) return;
    ev.preventDefault();
    const i = buttons.findIndex((b) => b.classList.contains("on"));
    const next =
      ev.key === "ArrowDown"
        ? (i + 1) % buttons.length
        : i <= 0
          ? buttons.length - 1
          : i - 1;
    for (const b of buttons) b.classList.remove("on");
    buttons[next].classList.add("on");
    buttons[next].scrollIntoView({ block: "nearest" });
    return;
  }
  if (ev.key === "Tab" && ev.shiftKey) {
    ev.preventDefault();
    const order = ["supervised", "auto-accept", "auto", "full-access"];
    const ch = currentChannel();
    if (!ch) return;
    const next = order[(order.indexOf(ch.permissionMode) + 1) % order.length];
    api("/api/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: state.id, mode: next }),
    }).then(() => {
      ch.permissionMode = next;
      syncModeChip();
    });
    return;
  }
  if (ev.key === "Enter" && !ev.shiftKey) {
    const pick = els.palette && !els.palette.hidden && els.palette.querySelector("button.on");
    if (pick) {
      ev.preventDefault();
      pick.click();
      return;
    }
    if (pathPending) {
      ev.preventDefault();
      return;
    }
    ev.preventDefault();
    const t = els.draft.value.trim();
    if (t.startsWith("/") && !t.includes(" ")) {
      runSlash(t.slice(1));
      return;
    }
    els.form?.requestSubmit();
  }
}



function bufB64(bytes) {
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function renderAttachChips() {
  const list = els.attachChips;
  if (!list) return;
  const items = paneAttach[state.activePane] ?? [];
  list.replaceChildren();
  list.hidden = items.length === 0;
  for (const item of items) {
    const li = document.createElement("li");
    const t = document.createElement("span");
    t.textContent = item.label;
    const x = document.createElement("button");
    x.type = "button";
    x.append(ico("x"));
    x.setAttribute("aria-label", "Remove file");
    x.onclick = () => {
      paneAttach[state.activePane] = (paneAttach[state.activePane] ?? []).filter(
        (q) => q !== item,
      );
      renderAttachChips();
    };
    li.append(t, x);
    list.append(li);
  }
}

function queueAttachFiles(fileList, folder) {
  const i = state.activePane === 1 ? 1 : 0;
  if (!paneAttach[i]) paneAttach[i] = [];
  for (const f of fileList ?? []) {
    const rel = folder
      ? String(f.webkitRelativePath || f.name).replace(/\\/g, "/")
      : f.name;
    if (!rel) continue;
    if (paneAttach[i].some((a) => a.label === rel && a.file)) continue;
    paneAttach[i].push({ label: rel, file: f, rel });
  }
  renderAttachChips();
}

async function attachFiles(uploads) {
  if (!uploads.length) return [];
  const files = [];
  for (const u of uploads) {
    const buf = new Uint8Array(await u.file.arrayBuffer());
    files.push({ path: u.rel || u.file.name, content: bufB64(buf) });
  }
  const data = await (
    await api("/api/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    })
  ).json();
  if (data.error) throw new Error(data.error);
  return { paths: data.paths ?? [], captions: data.captions ?? {} };
}

async function onComposerSubmit(ev) {
  ev.preventDefault();
  const pane = ev.currentTarget.closest(".pane");
  const idx = Number(pane?.dataset.pane) === 1 ? 1 : 0;
  if (state.running && idx !== state.runPane) {
    toast("Wait for the current run to finish.");
    return;
  }
  state.activePane = idx;
  state.runPane = idx;
  bindPane(idx);
  const paneState = state.panes[idx];
  if (paneState) {
    state.kind = paneState.kind;
    state.id = paneState.id;
  }
  let text = els.draft?.value.trim() ?? "";
  if (!state.id) return;
  const pending = [...(paneAttach[idx] ?? [])];
  if (state.kind === "dm" && isWatchingDm(state.id)) return;
  hidePalette();
  try {
    const attached = await attachFiles(pending.filter((a) => a.file));
    const paths = attached.paths ?? [];
    const captions = attached.captions ?? {};
    const imageLines = paths
      .filter((p) => captions[p])
      .map((p) => `[image ${p}: ${captions[p]}]`);
    if (imageLines.length) {
      text = text ? `${imageLines.join("\n")}\n\n${text}` : imageLines.join("\n");
    }
    if (paths.length) {
      const block = ["Attached:", ...paths.map((p) => `- ${p}`)].join("\n");
      text = text ? `${text}\n\n${block}` : block;
    }
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
    return;
  }
  if (!text) return;
  paneAttach[idx] = [];
  renderAttachChips();
  state.lastPrompt = text;
  if (els.send) els.send.disabled = true;
  addMessage({ who: "you", text });
  if (els.draft) {
    els.draft.value = "";
    els.draft.style.height = "auto";
  }
  const runKind = state.kind;
  const runId = state.id;
  try {
    if (runKind === "dm") {
      const parsed = parseDm(runId);
      const to = parsed.b;
      await api("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "human", to, text, threadId: runId }),
      });
      state.bootstrap = await (await api("/api/bootstrap")).json();
      bindPane(state.runPane);
      await openThread("dm", runId);
      await maybeAutoCompact("dm", runId);
    } else {
      setRunning(true);
      const res = await fetch("/api/say", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: runId,
          text,
          thinking: true,
          verbose: true,
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
          bindPane(state.runPane);
          if (row.type === "status") {
            const li = document.createElement("li");
            li.className = "status";
            li.textContent = row.message;
            els.log?.append(li);
            const who = String(row.message).split("→")[0]?.trim();
            if (who) setActivity(who, "Calling model");
            pinBottom();
          } else if (row.type === "text") {
            appendAccount(row.botId, row.text, false);
          } else if (row.type === "thinking") {
            appendThinking(row.botId, row.text);
          } else if (row.type === "tool") {
            appendTool(row.botId, row.name, row.args);
          } else if (row.type === "ask") {
            showAsk(row);
          } else if (row.type === "error") {
            addMessage({
              who: `@${row.botId ?? "engine"}`,
              botId: row.botId,
              text: row.message,
              kind: "error",
            });
          } else if (row.type === "done") {
            if (currentTurn) currentTurn.sealed = true;
            state.bootstrap = await (await api("/api/bootstrap")).json();
            markRead(runKind, runId);
            renderRail();
            await maybeAutoCompact(runKind, runId);
            await renderContextChip();
          }
        }
      }
    }
  } catch (err) {
    bindPane(state.runPane);
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
  setRunning(false);
  bindPane(state.runPane);
  if (els.send) els.send.disabled = false;
  pinBottom();
  els.draft?.focus();
}

function showAsk(row) {
  const li = document.createElement("li");
  li.className = "ask-card";
  const label = document.createElement("span");
  label.textContent = `@${row.botId} wants ${toolLabel(row.tool, row.args)}`;
  const allow = document.createElement("button");
  allow.type = "button";
  allow.className = "primary";
  allow.append(ico("check"), document.createTextNode("Allow"));
  const always = document.createElement("button");
  always.type = "button";
  always.className = "ghost";
  always.textContent = "Always";
  const deny = document.createElement("button");
  deny.type = "button";
  deny.className = "danger";
  deny.append(ico("x"), document.createTextNode("Deny"));
  const send = (decision) => {
    allow.disabled = true;
    always.disabled = true;
    deny.disabled = true;
    api("/api/permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, tool: row.tool, args: row.args ?? {} }),
    }).catch((err) => {
      addMessage({ who: "error", text: String(err), kind: "error" });
    });
  };
  allow.onclick = () => send("allow");
  always.onclick = () => send("always");
  deny.onclick = () => send("deny");
  li.append(label, allow, always, deny);
  els.log.append(li);
  pinBottom();
}

let pathSeq = 0;
let pathTimer = 0;
let pathPending = false;

function hidePalette() {
  pathSeq += 1;
  pathPending = false;
  clearTimeout(pathTimer);
  if (!els.palette) return;
  els.palette.hidden = true;
  els.palette.replaceChildren();
}

function jumpItems() {
  const items = [];
  for (const ch of state.bootstrap?.channels ?? []) {
    const icon = ch.icon && ch.icon !== "#" ? ch.icon : "#";
    const titled = String(ch.title || "").trim();
    items.push({
      kind: "channel",
      id: ch.id,
      label: titled ? `${icon}  ${titled}` : `#${ch.id}`,
      hint: "channel",
    });
  }
  for (const bot of state.bootstrap?.bots ?? []) {
    const named = String(bot.name || "").trim();
    items.push({
      kind: "person",
      id: bot.id,
      label: named || `@${bot.id}`,
      hint: "person",
    });
  }
  for (const dm of state.bootstrap?.dms ?? []) {
    const headline = dmHeadline(dm.id);
    items.push({
      kind: "dm",
      id: dm.id,
      label: headline || "@peer · chat",
      hint: "direct",
    });
  }
  return items;
}

function closeJump() {
  const el = document.getElementById("jump");
  if (el) el.hidden = true;
}

function renderJumpList() {
  const list = document.getElementById("jump-list");
  const qEl = document.getElementById("jump-q");
  if (!list || !qEl) return;
  const q = qEl.value.trim().toLowerCase();
  const items = jumpItems().filter((it) => {
    if (!q) return true;
    return (
      it.label.toLowerCase().includes(q) ||
      String(it.id).toLowerCase().includes(q) ||
      it.hint.toLowerCase().includes(q)
    );
  });
  list.replaceChildren();
  for (const [i, it] of items.entries()) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    if (i === 0) btn.className = "on";
    btn.dataset.kind = it.kind;
    btn.dataset.id = it.id;
    btn.append(document.createTextNode(it.label));
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = it.hint;
    btn.append(hint);
    btn.onclick = () => activateJumpItem(it.kind, it.id);
    li.append(btn);
    list.append(li);
  }
}

function openJump() {
  const el = document.getElementById("jump");
  const q = document.getElementById("jump-q");
  if (!el || !q) return;
  closeMenu();
  hidePalette();
  el.hidden = false;
  q.value = "";
  renderJumpList();
  q.focus();
}

function moveJump(delta) {
  const btns = [...document.querySelectorAll("#jump-list button")];
  if (!btns.length) return;
  let i = btns.findIndex((b) => b.classList.contains("on"));
  if (i < 0) i = 0;
  i = (i + delta + btns.length) % btns.length;
  for (const b of btns) b.classList.remove("on");
  btns[i].classList.add("on");
  btns[i].scrollIntoView({ block: "nearest" });
}

function activateJumpItem(kind, id) {
  closeJump();
  if (kind === "channel") paneOpen(state.activePane, "channel", id);
  else if (kind === "dm") paneOpen(state.activePane, "dm", id);
  else if (kind === "person") openPersonDm(id);
}

function activateJump() {
  const btn = document.querySelector("#jump-list button.on");
  if (!btn) return;
  activateJumpItem(btn.dataset.kind, btn.dataset.id);
}

document.getElementById("jump-q")?.addEventListener("input", renderJumpList);
document.getElementById("jump")?.addEventListener("mousedown", (ev) => {
  if (ev.target.id === "jump") closeJump();
});
document.addEventListener("keydown", (ev) => {
  const jump = document.getElementById("jump");
  const q = document.getElementById("jump-q");
  const open = Boolean(jump && !jump.hidden);
  const menu = document.getElementById("ctx-menu");
  const menuOpen = Boolean(menu && !menu.hidden);
  if ((ev.ctrlKey || ev.metaKey) && ev.key === "k") {
    if (document.querySelector("dialog[open]")) return;
    ev.preventDefault();
    if (open) {
      q?.focus();
      return;
    }
    openJump();
    return;
  }
  if (ev.key === "Escape" && menuOpen) {
    ev.preventDefault();
    closeMenu();
    return;
  }
  if (!open) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeJump();
    return;
  }
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    moveJump(ev.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (ev.key === "Enter") {
    ev.preventDefault();
    activateJump();
  }
});

function closeMenu() {
  const menu = document.getElementById("ctx-menu");
  if (menu) menu.hidden = true;
}

function copyText(text) {
  const value = String(text ?? "");
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).catch(() => {});
  }
}

function markUnread(kind, id) {
  const posted = postedOf(kind, id);
  if (!posted) return;
  const map = seenMap();
  map[threadKey(kind, id)] = Math.max(0, posted - 1);
  saveSeen(map);
  renderRail();
}

function pinStorageKey(kind, id) {
  return `crew.pins:${kind}:${id}`;
}

function loadPins(kind, id) {
  try {
    const raw = sessionStorage.getItem(pinStorageKey(kind, id));
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function renderPinStrip() {
  const strip = els.pinStrip;
  if (!strip) return;
  const pins = state.id ? loadPins(state.kind, state.id) : [];
  if (!pins.length) {
    strip.hidden = true;
    strip.replaceChildren();
    return;
  }
  strip.hidden = false;
  const label = document.createElement("span");
  label.className = "pin-label";
  label.textContent = "Pinned";
  strip.replaceChildren(label);
  for (const pin of pins) {
    const chip = document.createElement("span");
    chip.className = "pin-text";
    chip.textContent = String(pin.text || "").replace(/\s+/g, " ").slice(0, 80);
    if (pin.who) chip.title = pin.who;
    strip.append(chip);
  }
}

function messageCopyText(msg) {
  const copy = msg.querySelector(".copy");
  if (!copy) return "";
  if (copy.dataset.raw) return copy.dataset.raw;
  const retry = copy.querySelector(".retry");
  let text = copy.textContent || "";
  if (retry) text = text.replace(retry.textContent || "", "");
  return text.trim();
}

function pinMessage(msg) {
  const text = messageCopyText(msg);
  const tag = msg.querySelector(".tag")?.textContent?.trim();
  const who = msg.classList.contains("you")
    ? "you"
    : tag
      ? tag.replace(/^@/, "")
      : (msg.querySelector(".who")?.childNodes[0]?.textContent || "").trim();
  const pins = loadPins(state.kind, state.id);
  pins.unshift({ text, who, ts: Date.now() });
  sessionStorage.setItem(
    pinStorageKey(state.kind, state.id),
    JSON.stringify(pins.slice(0, 20)),
  );
  renderPinStrip();
}

function openMenu(x, y, items) {
  const menu = document.getElementById("ctx-menu");
  if (!menu || !items?.length) return;
  if (document.querySelector("dialog[open]")) return;
  menu.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = item.id;
    btn.textContent = item.label;
    if (item.danger) btn.classList.add("danger");
    btn.onclick = () => {
      closeMenu();
      item.run?.();
    };
    li.append(btn);
    menu.append(li);
  }
  menu.hidden = false;
  const pad = 6;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = x;
  let top = y;
  if (left + mw > innerWidth - pad) left = innerWidth - mw - pad;
  if (top + mh > innerHeight - pad) top = innerHeight - mh - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function railMenuItems(kind, id) {
  const items = [
    {
      id: "open",
      label: "Open",
      run: () => {
        if (kind === "person") openPersonDm(id);
        else paneOpen(state.activePane, kind, id);
      },
    },
    {
      id: "open-right",
      label: "Open to the right",
      run: () => {
        if (kind === "person") {
          splitOpen("dm", latestHumanDm(id)?.id || `human__${id}`, "right");
        } else {
          splitOpen(kind, id, "right");
        }
      },
    },
    {
      id: "open-below",
      label: "Open below",
      run: () => {
        if (kind === "person") {
          splitOpen("dm", latestHumanDm(id)?.id || `human__${id}`, "below");
        } else {
          splitOpen(kind, id, "below");
        }
      },
    },
    {
      id: "copy-id",
      label: "Copy id",
      run: () => {
        const text =
          kind === "channel" ? `#${id}` : kind === "person" ? `@${id}` : id;
        copyText(text);
      },
    },
  ];
  if (kind === "dm") {
    items.push({
      id: "mark-unread",
      label: "Mark unread",
      run: () => markUnread("dm", id),
    });
  }
  return items;
}

function showRailMenu(ev, kind, id) {
  if (document.querySelector("dialog[open]")) return;
  ev.preventDefault();
  openMenu(ev.clientX, ev.clientY, railMenuItems(kind, id));
}

els.channels.addEventListener("contextmenu", (ev) => {
  const btn = ev.target.closest("#channel-list > button");
  if (!btn || !btn.dataset.id) return;
  showRailMenu(ev, "channel", btn.dataset.id);
});

els.people.addEventListener("contextmenu", (ev) => {
  const row = ev.target.closest(".person");
  if (!row || !els.people.contains(row) || !row.dataset.id) return;
  showRailMenu(ev, "person", row.dataset.id);
});

els.direct.addEventListener("contextmenu", (ev) => {
  const row = ev.target.closest(".dm-row");
  if (!row || !els.direct.contains(row) || !row.dataset.id) return;
  showRailMenu(ev, "dm", row.dataset.id);
});

function onLogContextMenu(ev) {
  const log = ev.currentTarget;
  const msg = ev.target.closest(".msg");
  if (!msg || !log.contains(msg)) return;
  if (document.querySelector("dialog[open]")) return;
  ev.preventDefault();
  const pane = log.closest(".pane");
  const idx = Number(pane?.dataset.pane) === 1 ? 1 : 0;
  activatePane(idx);
  const items = [
    {
      id: "copy-message",
      label: "Copy message",
      run: () => copyText(messageCopyText(msg)),
    },
  ];
  if (!msg.classList.contains("you")) {
    const tag = msg.querySelector(".tag")?.textContent?.trim();
    if (tag) {
      items.push({
        id: "copy-id",
        label: "Copy id",
        run: () => copyText(tag.startsWith("@") ? tag : `@${tag}`),
      });
    }
  }
  items.push(
    {
      id: "mark-unread",
      label: "Mark unread",
      run: () => markUnread(state.kind, state.id),
    },
    { id: "pin", label: "Pin", run: () => pinMessage(msg) },
  );
  openMenu(ev.clientX, ev.clientY, items);
}

document.addEventListener("pointerdown", (ev) => {
  const menu = document.getElementById("ctx-menu");
  if (!menu || menu.hidden) return;
  if (menu.contains(ev.target)) return;
  closeMenu();
});

document.addEventListener("scroll", closeMenu, true);
window.addEventListener("scroll", closeMenu);

function insertAtCursor(extra) {
  const el = els.draft;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  el.value = `${el.value.slice(0, start)}${extra}${el.value.slice(end)}`;
  const pos = start + extra.length;
  el.setSelectionRange(pos, pos);
  el.focus();
}

function atToken(value, caret) {
  const left = value.slice(0, caret);
  const m = left.match(/(^|\s)(@(?:[A-Za-z0-9_./-]*))$/);
  return m ? m[2] : "";
}

function replaceAtToken(insert) {
  if (!els.draft) return;
  const caret = els.draft.selectionStart ?? 0;
  const value = els.draft.value;
  const cur = atToken(value, caret);
  const start = caret - cur.length;
  els.draft.value = `${value.slice(0, start)}${insert}${value.slice(caret)}`;
  const pos = start + insert.length;
  els.draft.setSelectionRange(pos, pos);
  hidePalette();
  els.draft.focus();
}

function paintPaletteOn() {
  if (!els.palette) return;
  if (els.palette.querySelector("button.on")) return;
  els.palette.querySelector("button")?.classList.add("on");
}

function pathButton(p) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = p;
  btn.onclick = () => replaceAtToken(`@${p} `);
  return btn;
}

function renderPalette() {
  if (!els.draft || !els.palette) return;
  const caret = els.draft.selectionStart ?? els.draft.value.length;
  const value = els.draft.value;
  const at = atToken(value, caret);
  const slash = value.trimStart().startsWith("/") && !value.includes("\n");
  pathSeq += 1;
  pathPending = false;
  clearTimeout(pathTimer);
  els.palette.replaceChildren();
  if (at) {
    const remainder = at.slice(1);
    const q = remainder.toLowerCase();
    const bots = (state.bootstrap?.bots ?? []).filter(
      (b) => !q || b.id.includes(q) || (b.name || "").toLowerCase().includes(q),
    );
    for (const b of bots) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = "";
      btn.textContent = `@${b.id}`;
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = b.name;
      btn.append(hint);
      btn.onclick = () => replaceAtToken(`@${b.id} `);
      els.palette.append(btn);
    }
    const wantPaths =
      remainder.includes("/") || remainder.includes(".") || remainder.length >= 2;
    const seq = pathSeq;
    const qPath = remainder.replace(/^\.\//, "");
    if (wantPaths && qPath) {
      pathPending = true;
      pathTimer = setTimeout(() => {
        fetch(`/api/paths?q=${encodeURIComponent(qPath)}`)
          .then((r) => r.json())
          .then((data) => {
            if (seq !== pathSeq) return;
            const paths = Array.isArray(data.paths) ? data.paths : [];
            for (const p of paths) els.palette.append(pathButton(p));
            paintPaletteOn();
            els.palette.hidden = !els.palette.children.length;
            pathPending = false;
          })
          .catch(() => {
            if (seq !== pathSeq) return;
            pathPending = false;
          });
      }, 120);
    }
    paintPaletteOn();
    els.palette.hidden = !bots.length;
    return;
  }
  if (slash) {
    const q = value.trim().slice(1).toLowerCase();
    const cmds = SLASH_CMDS.filter((c) => !q || c.id.startsWith(q));
    for (const c of cmds) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `/${c.id}`;
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = c.hint;
      btn.append(hint);
      btn.onclick = () => runSlash(c.id);
      els.palette.append(btn);
    }
    els.palette.hidden = !cmds.length;
    return;
  }
  hidePalette();
}

let toastTimer = 0;
function toast(text) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

const SLASH_CMDS = [
  { id: "help", hint: "list commands" },
  { id: "clear", hint: "hide older messages (logs stay)" },
  { id: "compact", hint: "summarize context (keeps the log)" },
  { id: "stop", hint: "stop this run" },
  { id: "mode", hint: "permission mode" },
  { id: "model", hint: "default model" },
  { id: "status", hint: "window and counts" },
  { id: "diff", hint: "files in this thread" },
  { id: "export", hint: "download JSON" },
  { id: "new", hint: "new chat with this person" },
  { id: "retry", hint: "resend last message" },
  { id: "new-person", hint: "create a bot" },
  { id: "new-channel", hint: "create a channel" },
  { id: "settings", hint: "OpenRouter and models" },
];

function openSlashHelp() {
  const list = document.getElementById("slash-help-list");
  const dlg = document.getElementById("slash-help");
  if (list) {
    list.replaceChildren();
    for (const c of SLASH_CMDS) {
      const li = document.createElement("li");
      const cmd = document.createElement("code");
      cmd.textContent = `/${c.id}`;
      li.append(cmd, ` — ${c.hint}`);
      list.append(li);
    }
  }
  dlg?.showModal();
}

function openModeSheet() {
  if (els.modeBtn?.disabled) return;
  const current = currentChannel()?.permissionMode;
  for (const btn of document.querySelectorAll("#mode-list [data-mode]")) {
    btn.classList.toggle("on", btn.dataset.mode === current);
  }
  els.modeModal.showModal();
}

async function runCompact() {
  if (!state.id) {
    toast("Compact is not ready yet.");
    return;
  }
  try {
    const res = await fetch("/api/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: state.kind, id: state.id }),
    });
    if (res.ok) {
      try {
        sessionStorage.setItem(autoCompactKey(state.kind, state.id), "1");
      } catch {
        /* quota */
      }
      toast("Compacted.");
      await renderContextChip();
      return;
    }
    if (res.status === 400 || res.status === 404 || !res.ok) {
      toast("Compact is not ready yet.");
    }
  } catch {
    toast("Compact is not ready yet.");
  }
}

async function showStatus() {
  const keep = Number(state.bootstrap?.keep) || 80;
  const posted = postedOf(state.kind, state.id);
  let compacted = "never";
  if (state.id) {
    try {
      const q = new URLSearchParams({ kind: state.kind, id: state.id });
      const meta = await (await fetch(`/api/compact-status?${q}`)).json();
      if (meta.lastCompactAt) compacted = meta.lastCompactAt;
    } catch {
      /* compact-status is optional for older engines */
    }
  }
  toast(`window ${keep} · posted ${posted} · compacted: ${compacted}`);
}

function runSlash(id) {
  hidePalette();
  if (id === "retry" && state.running && state.activePane !== state.runPane) {
    toast("Wait for the current run to finish.");
    return;
  }
  if (els.draft) els.draft.value = "";
  if (id === "help") {
    openSlashHelp();
    return;
  }
  if (id === "stop") {
    api("/api/stop", { method: "POST" }).catch(() => {});
    return;
  }
  if (id === "clear") {
    setClearedNow();
    els.log.replaceChildren();
    currentTurn = null;
    return;
  }
  if (id === "compact") {
    runCompact();
    return;
  }
  if (id === "mode") {
    openModeSheet();
    return;
  }
  if (id === "model") return openAppSettings();
  if (id === "status") {
    showStatus();
    return;
  }
  if (id === "diff") {
    openFilesModal();
    return;
  }
  if (id === "export") {
    exportThread();
    return;
  }
  if (id === "new") {
    if (state.kind === "dm" && parseDm(state.id).withHuman) {
      newPersonChat(parseDm(state.id).b).catch((err) => toast(String(err)));
      return;
    }
    toast("New chat is for Direct messages.");
    return;
  }
  if (id === "retry" && state.lastPrompt) {
    els.draft.value = state.lastPrompt;
    els.form.requestSubmit();
    return;
  }
  if (id === "new-person") return openCreate("person");
  if (id === "new-channel") return openCreate("channel");
  if (id === "settings") return openAppSettings();
}

function openCreate(kind) {
  state.creating = kind;
  if (kind === "person") {
    const id = randomId("p");
    state.editBotId = id;
    document.getElementById("bot-id").value = `@${id}`;
    document.getElementById("bot-name").value = "";
    document.getElementById("bot-soul").value = "";
    document.getElementById("bot-orders").value = "";
    iconPickers.bot?.set("");
    fillModelSelect(document.getElementById("bot-model"), "", "workspace default");
    fillModelSelect(document.getElementById("bot-fallback"), "", "workspace fallback");
    paintFace(document.getElementById("bot-face"), "", id);
    renderSkills([]);
    clearSkillForm();
    setSkillOpenEnabled(false);
    fillBotRooms("", true);
    const current = state.kind === "channel" ? state.id : "";
    if (current) {
      const row = document.querySelector(`#bot-rooms .roster-row[data-id="${current}"]`);
      if (row) row.classList.add("on");
    }
    document.getElementById("bot-delete").hidden = true;
    els.botModal.showModal();
    return;
  }
  const id = randomId("c");
  state.editChannelId = id;
  document.getElementById("ch-id").value = `#${id}`;
  document.getElementById("ch-title").value = "";
  document.getElementById("ch-context").value = "";
  document.getElementById("ch-rules").value = "";
  document.getElementById("ch-mode").value = "auto-accept";
  iconPickers.ch?.set("");
  paintFace(document.getElementById("ch-face"), "#", id);
  fillRoster(
    (state.bootstrap?.bots ?? []).map((b) => b.id),
    state.bootstrap?.bots?.[0]?.id,
  );
  chPaths = [];
  renderChPaths();
  document.getElementById("ch-delete").hidden = true;
  els.channelModal.showModal();
}

document.getElementById("add-channel").onclick = () => openCreate("channel");
document.getElementById("add-person").onclick = () => openCreate("person");
document.getElementById("ch-add-file").onclick = () => document.getElementById("ch-file-pick").click();
document.getElementById("ch-add-folder").onclick = () => document.getElementById("ch-folder-pick").click();
document.getElementById("ch-path-plus").onclick = () => {
  addChPath(document.getElementById("ch-path-extra").value);
  document.getElementById("ch-path-extra").value = "";
};
document.getElementById("ch-path-extra").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return;
  ev.preventDefault();
  addChPath(ev.target.value);
  ev.target.value = "";
});
document.getElementById("ch-file-pick").addEventListener("change", (ev) => {
  for (const f of ev.target.files ?? []) addChPath(f.webkitRelativePath || f.name);
  ev.target.value = "";
});
document.getElementById("ch-folder-pick").addEventListener("change", (ev) => {
  const files = [...(ev.target.files ?? [])];
  const roots = new Set();
  for (const f of files) {
    const rel = String(f.webkitRelativePath || f.name).replace(/\\/g, "/");
    const root = rel.split("/")[0];
    if (root) roots.add(`${root}/`);
  }
  for (const r of roots) addChPath(r);
  ev.target.value = "";
});
function colorDiff(snippet) {
  return String(snippet)
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      if (line.startsWith("+++") || line.startsWith("---")) return escaped;
      if (line.startsWith("+")) return `<span class="diff-add">${escaped}</span>`;
      if (line.startsWith("-")) return `<span class="diff-del">${escaped}</span>`;
      return escaped;
    })
    .join("\n");
}

async function openFilesModal() {
  const list = document.getElementById("files-list");
  list.replaceChildren();
  try {
    const q = new URLSearchParams({ kind: state.kind, id: state.id });
    const rows = await (await api(`/api/diff?${q}`)).json();
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "desk-empty";
      empty.textContent = "No file touches in this thread.";
      list.append(empty);
    } else {
      for (const row of rows) {
        const li = document.createElement("li");
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        const path = document.createElement("span");
        path.className = "path";
        path.textContent = row.path;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = `${row.tool}${row.botId ? ` · @${row.botId}` : ""}`;
        summary.append(path, " ", meta);
        details.append(summary);
        if (row.snippet) {
          const pre = document.createElement("pre");
          pre.className = "diff";
          pre.innerHTML = colorDiff(row.snippet);
          details.append(pre);
        }
        li.append(details);
        list.append(li);
      }
    }
    document.getElementById("files-modal").showModal();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

async function exportThread() {
  if (!state.id) return;
  try {
    const q = new URLSearchParams({
      kind: state.kind,
      id: state.id,
      thinking: "1",
      verbose: "1",
    });
    const rows = await (await api(`/api/thread?${q}`)).json();
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.kind === "dm" ? "dm" : "channel"}-${state.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

function decoratePane(r) {
  const map = [
    [".menu-btn", "menu"],
    [".files-btn", "file"],
    [".export-btn", "download"],
    [".title-regen", "pencil"],
    [".settings-btn", "hash"],
    [".attach-file", "file"],
    [".attach-folder", "folder"],
    [".jump-latest", "chevron"],
    [".stop", "stop"],
    [".send", "send"],
    [".pane-close", "x"],
  ];
  for (const [sel, icon] of map) decorateEl(r.querySelector(sel), icon);
}

function wirePane(i) {
  const r = paneRoot(i);
  if (!r || r.dataset.wired) return;
  r.dataset.wired = "1";
  decoratePane(r);
  r.addEventListener("pointerdown", () => {
    activatePane(i);
    renderPinStrip();
    syncModeChip();
    setDraftPlaceholder();
  });
  r.querySelector(".pane-close")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeSplit();
  });
  r.querySelector(".settings-btn")?.addEventListener("click", () => {
    activatePane(i);
    if (state.kind === "channel") openChannelSettings();
    else if (state.id.startsWith("human__")) {
      openBotSettings(state.id.slice("human__".length));
    }
  });
  r.querySelector(".title-regen")?.addEventListener("click", () => {
    activatePane(i);
    regenerateTitle();
  });
  r.querySelector(".menu-btn")?.addEventListener("click", () => {
    const open = !document.querySelector(".rail")?.classList.contains("open");
    setRailOpen(open);
  });
  r.querySelector(".mode-btn")?.addEventListener("click", () => {
    activatePane(i);
    openModeSheet();
  });
  r.querySelector(".log")?.addEventListener("click", (ev) => {
    const ping = ev.target.closest(".mention");
    if (!ping) return;
    const id = ping.dataset.id;
    if (!id || id === "everyone" || id === "you") return;
    paneOpen(state.activePane, "dm", `human__${id}`);
  });
  r.querySelector(".log")?.addEventListener("contextmenu", onLogContextMenu);
  r.querySelector(".draft")?.addEventListener("input", () => {
    activatePane(i);
    onDraftInput();
  });
  r.querySelector(".draft")?.addEventListener("keydown", (ev) => {
    activatePane(i);
    onDraftKeydown(ev);
  });
  const form = r.querySelector(".composer");
  form?.addEventListener("submit", onComposerSubmit);
  form?.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    form.classList.add("drop");
  });
  form?.addEventListener("dragleave", () => form.classList.remove("drop"));
  form?.addEventListener("drop", (ev) => {
    ev.preventDefault();
    form.classList.remove("drop");
    activatePane(i);
    const items = [...(ev.dataTransfer?.files ?? [])];
    if (!items.length) return;
    const folder = items.some((f) => f.webkitRelativePath);
    queueAttachFiles(items, folder);
  });
  r.querySelector(".stop")?.addEventListener("click", () => {
    activatePane(i);
    api("/api/stop", { method: "POST" }).catch((err) => {
      addMessage({ who: "error", text: String(err), kind: "error" });
    });
  });
  const filePick = r.querySelector(".draft-file-pick");
  const folderPick = r.querySelector(".draft-folder-pick");
  r.querySelector(".attach-file")?.addEventListener("click", () => {
    activatePane(i);
    filePick?.click();
  });
  r.querySelector(".attach-folder")?.addEventListener("click", () => {
    activatePane(i);
    folderPick?.click();
  });
  filePick?.addEventListener("change", (ev) => {
    activatePane(i);
    queueAttachFiles(ev.target.files, false);
    ev.target.value = "";
  });
  folderPick?.addEventListener("change", (ev) => {
    activatePane(i);
    queueAttachFiles(ev.target.files, true);
    ev.target.value = "";
  });
  r.querySelector(".jump-latest")?.addEventListener("click", () => {
    activatePane(i);
    if (els.jumpLatest) els.jumpLatest.hidden = true;
    scrollThread();
  });
  r.querySelector(".thread")?.addEventListener("scroll", () => {
    closeMenu();
    if (state.activePane !== i) return;
    if (nearBottom() && els.jumpLatest) els.jumpLatest.hidden = true;
  });
  r.querySelector(".search")?.addEventListener("input", () => {
    activatePane(i);
    searchHit = 0;
    applySearch();
  });
  r.querySelector(".search")?.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    activatePane(i);
    const hits = applySearch();
    if (!hits.length) return;
    searchHit = (searchHit + 1) % hits.length;
    hits.forEach((h, n) => h.classList.toggle("current", n === searchHit));
    hits[searchHit].scrollIntoView({ block: "center" });
  });
  r.querySelector(".files-btn")?.addEventListener("click", () => {
    activatePane(i);
    openFilesModal();
  });
  r.querySelector(".export-btn")?.addEventListener("click", () => {
    activatePane(i);
    exportThread();
  });
}

function hideDropGhosts() {
  const right = document.getElementById("drop-right");
  const below = document.getElementById("drop-below");
  if (right) right.hidden = true;
  if (below) below.hidden = true;
}

function dropHow(ev) {
  const host = document.getElementById("panes");
  if (!host) return "replace";
  const rect = host.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / Math.max(1, rect.width);
  const y = (ev.clientY - rect.top) / Math.max(1, rect.height);
  if (x > 0.5) return "right";
  if (y > 0.5) return "below";
  return "replace";
}

function showDropGhosts(how) {
  const right = document.getElementById("drop-right");
  const below = document.getElementById("drop-below");
  if (right) right.hidden = how !== "right";
  if (below) below.hidden = how !== "below";
}

function parseThreadPayload(raw) {
  const text = String(raw || "");
  const cut = text.indexOf(":");
  if (cut < 0) return null;
  const kind = text.slice(0, cut);
  const id = text.slice(cut + 1);
  if (!kind || !id) return null;
  return { kind, id };
}

function onRailDragStart(ev, kind, id) {
  const next = resolvePaneTarget(kind, id);
  ev.dataTransfer.setData(THREAD_MIME, `${next.kind}:${next.id}`);
  ev.dataTransfer.effectAllowed = "copyMove";
}

function wireDrag() {
  els.channels?.addEventListener("dragstart", (ev) => {
    const btn = ev.target.closest("#channel-list > button");
    if (!btn?.dataset.id) return;
    onRailDragStart(ev, "channel", btn.dataset.id);
  });
  els.people?.addEventListener("dragstart", (ev) => {
    const row = ev.target.closest(".person");
    if (!row?.dataset.id) return;
    onRailDragStart(ev, "person", row.dataset.id);
  });
  els.direct?.addEventListener("dragstart", (ev) => {
    const row = ev.target.closest(".dm-row");
    if (!row?.dataset.id) return;
    onRailDragStart(ev, "dm", row.dataset.id);
  });
  const host = document.getElementById("panes");
  if (!host) return;
  host.addEventListener("dragover", (ev) => {
    if (![...ev.dataTransfer.types].includes(THREAD_MIME)) return;
    ev.preventDefault();
    showDropGhosts(dropHow(ev));
  });
  host.addEventListener("dragleave", (ev) => {
    if (!host.contains(ev.relatedTarget)) hideDropGhosts();
  });
  host.addEventListener("drop", (ev) => {
    ev.preventDefault();
    hideDropGhosts();
    const parsed = parseThreadPayload(ev.dataTransfer.getData(THREAD_MIME));
    if (!parsed?.id) return;
    splitOpen(parsed.kind, parsed.id, dropHow(ev));
  });
  document.addEventListener("dragend", hideDropGhosts);
}

function wireSplitHandle() {
  const handle = document.getElementById("split-handle");
  const host = document.getElementById("panes");
  if (!handle || !host) return;
  let dragging = false;
  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    handle.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  handle.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const rect = host.getBoundingClientRect();
    if (state.split === "right") {
      const min = 280;
      let left = ev.clientX - rect.left;
      left = Math.max(min, Math.min(rect.width - min - 8, left));
      host.style.gridTemplateColumns = `${left}px 8px minmax(280px, 1fr)`;
    } else if (state.split === "below") {
      const min = 160;
      let top = ev.clientY - rect.top;
      top = Math.max(min, Math.min(rect.height - min - 8, top));
      host.style.gridTemplateRows = `${top}px 8px minmax(160px, 1fr)`;
    }
  });
  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

document.getElementById("files-close").onclick = () =>
  document.getElementById("files-modal").close();
document.getElementById("always-clear").onclick = async () => {
  try {
    await api("/api/permissions", { method: "DELETE" });
    await renderAlways();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
};

decorateChrome();
wirePane(0);
wirePane(1);
wireDrag();
wireSplitHandle();
boot().catch((err) => {
  addMessage({ who: "error", text: String(err), kind: "error" });
});
