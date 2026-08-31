import { createFloor } from "./floor-game.js";
import { youHome as isoYouHome } from "./floor-iso.js";
import { workspaceRelPath, resolveWorkspaceHint } from "./workspace-path.js";

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
  deskOpen: sessionStorage.getItem("crew.deskOpen") !== "0",
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
  if (label && label !== "+" && label !== "Ã—") {
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
  floorPlaque: document.getElementById("floor-plaque"),
  floorKit: document.getElementById("floor-kit"),
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
  els.brief = r.querySelector(".room-brief");
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
  if (handle) {
    handle.hidden = false;
    handle.removeAttribute("hidden");
  }
  if (how === "none") {
    if (extra) extra.hidden = true;
    extra?.classList.remove("vacant");
    host.style.gridTemplateColumns = "";
  } else {
    if (extra) {
      extra.hidden = false;
      extra.removeAttribute("hidden");
    }
  }
  applyDesk();
}

function setPaneVacant(on) {
  const extra = document.getElementById("pane-1");
  const empty = document.getElementById("pane-1-empty");
  extra?.classList.toggle("vacant", on);
  if (empty) empty.hidden = !on;
}

function applyDesk() {
  const stage = document.querySelector(".stage");
  stage?.classList.toggle("desk-off", !state.deskOpen);
  const btn = document.getElementById("desk-toggle");
  if (btn) btn.setAttribute("aria-pressed", state.deskOpen ? "true" : "false");
  try {
    sessionStorage.setItem("crew.deskOpen", state.deskOpen ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function closeSplit() {
  state.split = "none";
  state.panes[1] = null;
  state.activePane = 0;
  state.deskOpen = true;
  setPaneVacant(false);
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
  if (i === 1) setPaneVacant(false);
  state.activePane = i;
  bindPane(i);
  markActivePane(i);
  saveSplit();
  return openThread(next.kind, next.id);
}

function splitOpen(kind, id, how) {
  const next = resolvePaneTarget(kind, id);
  if (how === "right" || how === "below") {
    if (state.split === "none" && how === "right") state.deskOpen = false;
    state.split = how;
    applySplitClass(how);
    saveSplit();
    return paneOpen(1, next.kind, next.id);
  }
  return paneOpen(state.activePane, next.kind, next.id);
}

function splitCurrent(how) {
  const p = state.panes[state.activePane] || { kind: state.kind, id: state.id };
  if (!p?.kind || !p?.id) return;
  return splitOpen(p.kind, p.id, how);
}

function isDesktopShell() {
  return Boolean(window.__CREW_DESKTOP__ || window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function deskInvoke(cmd, payload) {
  const fn = window.__TAURI_INTERNALS__?.invoke;
  if (!fn) return Promise.reject(new Error("no tauri"));
  return fn(cmd, payload || {});
}

async function windowCall(kind) {
  try {
    if (kind === "close") return await deskInvoke("plugin:window|close");
    if (kind === "minimize") return await deskInvoke("plugin:window|minimize");
    if (kind === "toggle") return await deskInvoke("plugin:window|toggle_maximize");
    if (kind === "openProject") {
      return await deskInvoke("plugin:event|emit", { event: "crew-open-project", payload: null });
    }
  } catch (err) {
    console.warn("window", kind, err);
  }
}

function fillAppTop() {
  const cwd = document.getElementById("app-cwd");
  if (cwd) {
    const path = String(state.bootstrap?.cwd || "").trim();
    cwd.textContent = path;
    cwd.title = path || "Project folder";
  }
  const desk = isDesktopShell();
  document.documentElement.classList.toggle("is-desktop", desk);
  const closeBtn = document.getElementById("win-close");
  if (closeBtn) closeBtn.title = desk ? "Hide to tray" : "Close";
  const open = document.getElementById("win-open-project");
  const btns = document.getElementById("win-btns");
  if (open) open.hidden = !desk;
  if (btns) btns.hidden = !desk;
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

function currentDm() {
  if (state.kind !== "dm" || !state.id) return null;
  return (state.bootstrap?.dms ?? []).find((d) => d.id === state.id) ?? null;
}

function currentPermissionMode() {
  if (state.kind === "channel") return currentChannel()?.permissionMode ?? "auto-accept";
  if (state.kind === "dm") return currentDm()?.permissionMode ?? "auto-accept";
  return "auto-accept";
}

function allowedModels() {
  return state.bootstrap?.models ?? [];
}

const VENDOR_NAMES = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "google-ai-studio": "Google",
  "z-ai": "Z.AI",
  "x-ai": "xAI",
  "meta-llama": "Meta",
  mistralai: "Mistral",
  qwen: "Qwen",
  deepseek: "DeepSeek",
  cohere: "Cohere",
  perplexity: "Perplexity",
  nvidia: "NVIDIA",
  amazon: "Amazon",
  moonshotai: "Moonshot",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
};

function providerGroup(id) {
  if (!id) return "";
  if (id.startsWith("harness:")) {
    const h = id.slice("harness:".length).split(":")[0];
    if (h === "claude") return "Claude";
    if (h === "codex") return "Codex";
    if (h === "grok") return "Grok";
    if (h === "opencode") return "OpenCode";
    return "Harnesses";
  }
  return "OpenRouter";
}

function modelShortName(id, label) {
  if (!id) return label || "";
  if (id.startsWith("harness:")) return label || id.slice("harness:".length);
  const rest = String(id).split("/").slice(1).join("/");
  return rest || label || id;
}

function vendorLogo(name) {
  const key = String(name || "all").toLowerCase();
  const svg = (path, view = "0 0 24 24") => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("viewBox", view);
    el.setAttribute("class", "model-picker-logo");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = path;
    return el;
  };
  if (key === "all") {
    return svg(
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    );
  }
  if (key === "openrouter") {
    return svg('<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8" fill="none" stroke="currentColor" stroke-width="2"/>');
  }
  if (key === "claude") {
    return svg('<path d="M12 3l2.4 6.2L21 10l-5 4.1 1.6 6.9L12 17.6 6.4 21 8 14.1 3 10l6.6-.8z"/>');
  }
  if (key === "codex") {
    return svg(
      '<path d="M12 3.2c1.7-1 3.9-.6 5.2.9 1.3 1.5 1.5 3.7.7 5.5 1.7 1.2 2.4 3.4 1.8 5.4-.6 2-2.4 3.5-4.5 3.8-1.1 1.7-3.1 2.5-5.1 2.1-2-.4-3.5-1.9-4.1-3.8-1.8-.6-3.1-2.1-3.4-4-.3-1.9.5-3.8 2-4.9C3.8 6.4 4.6 4.3 6.3 3.2 8 2.1 10.2 2.2 12 3.2z"/>',
    );
  }
  if (key === "grok") {
    return svg('<path d="M5 5l6.2 7.4L5 19h3.2l4.4-5.3L17.2 19H19l-6.4-7.6L19 5h-3.2l-4.2 5.1L7.8 5z"/>');
  }
  if (key === "opencode") {
    return svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="2"/>');
  }
  if (key === "openai") {
    return svg(
      '<path d="M12 3.2c1.7-1 3.9-.6 5.2.9 1.3 1.5 1.5 3.7.7 5.5 1.7 1.2 2.4 3.4 1.8 5.4-.6 2-2.4 3.5-4.5 3.8-1.1 1.7-3.1 2.5-5.1 2.1-2-.4-3.5-1.9-4.1-3.8-1.8-.6-3.1-2.1-3.4-4-.3-1.9.5-3.8 2-4.9C3.8 6.4 4.6 4.3 6.3 3.2 8 2.1 10.2 2.2 12 3.2z"/>',
    );
  }
  if (key === "anthropic") {
    return svg('<path d="M12 3l2.4 6.2L21 10l-5 4.1 1.6 6.9L12 17.6 6.4 21 8 14.1 3 10l6.6-.8z"/>');
  }
  if (key === "google") {
    return svg(
      '<circle cx="8" cy="8" r="3.2" fill="#ea4335"/><circle cx="16" cy="8" r="3.2" fill="#4285f4"/><circle cx="8" cy="16" r="3.2" fill="#fbbc04"/><circle cx="16" cy="16" r="3.2" fill="#34a853"/>',
    );
  }
  if (key === "xai" || key === "x-ai") {
    return svg('<path d="M5 5l6.2 7.4L5 19h3.2l4.4-5.3L17.2 19H19l-6.4-7.6L19 5h-3.2l-4.2 5.1L7.8 5z"/>');
  }
  if (key === "meta" || key === "meta-llama") {
    return svg('<path d="M7 16c-2.2-2.4-3-5-3-7.2C4 5.4 6 3.5 8.4 3.5c1.7 0 3 1 3.6 2.6.6-1.6 1.9-2.6 3.6-2.6C17.9 3.5 20 5.4 20 8.8c0 2.2-.8 4.8-3 7.2-1.6 1.8-3.4 3-5 3s-3.4-1.2-5-3z"/>');
  }
  if (key === "mistral" || key === "mistralai") {
    return svg('<path d="M4 18V6h3.2l2.2 5.5L12 6h3.2L12.8 18H9.6l1.5-5.2L8.6 18H4zm12.2 0V6H20v12h-3.8z"/>');
  }
  if (key === "harnesses") {
    return svg('<path d="M8 4h8v3H8zM5 9h14v3H5zm3 5h8v6H8z"/>');
  }
  if (key === "z.ai" || key === "z-ai") {
    return svg('<path d="M6 6h12v3.2L10.4 15H18V18H6v-3.2L13.6 9H6z"/>');
  }
  if (key === "qwen") {
    return svg('<circle cx="12" cy="12" r="8"/><path d="M9 12h6M12 9v6" fill="none" stroke="currentColor" stroke-width="2"/>');
  }
  if (key === "deepseek") {
    return svg('<path d="M5 12c0-4 3-7 7-7s7 3 7 7-3 8-7 8c-2 0-3-.6-4.2-1.6"/>');
  }
  const letter = document.createElement("span");
  letter.className = "model-picker-logo letter";
  letter.textContent = (name || "?").slice(0, 1).toUpperCase();
  return letter;
}

function catId(label) {
  if (!label || label === "All") return "all";
  return String(label).toLowerCase();
}

function pickerGroups(select) {
  const by = new Map();
  const order = [];
  const add = (group, value, label) => {
    if (!by.has(group)) {
      by.set(group, []);
      order.push(group);
    }
    by.get(group).push({ value, label });
  };
  for (const child of [...select.children]) {
    if (child.tagName === "OPTION") {
      if (!child.value) continue;
      add(providerGroup(child.value), child.value, child.textContent);
    } else if (child.tagName === "OPTGROUP") {
      const g = child.label || "OpenRouter";
      for (const opt of child.querySelectorAll("option")) {
        add(g, opt.value, opt.textContent);
      }
    }
  }
  const rank = ["OpenRouter", "Claude", "Codex", "Grok", "OpenCode"];
  const names = [...order].sort((a, b) => {
    const ia = rank.indexOf(a);
    const ib = rank.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return names.map((n) => ({ label: n, items: by.get(n) || [] }));
}

function closeModelPickers(except) {
  for (const menu of document.querySelectorAll(".model-picker-menu")) {
    if (menu === except) continue;
    menu.hidden = true;
    const wrap = menu._wrap;
    if (wrap && menu.parentNode !== wrap) wrap.append(menu);
  }
}

function pickerHost(wrap) {
  return wrap.closest("dialog") || document.body;
}

function placePickerMenu(wrap) {
  const btn = wrap.querySelector(".model-picker-btn");
  const menu = wrap._menu || wrap.querySelector(".model-picker-menu");
  if (!btn || !menu) return;
  const host = pickerHost(wrap);
  const br = btn.getBoundingClientRect();
  const hr =
    host === document.body
      ? { left: 8, width: window.innerWidth - 16, bottom: window.innerHeight - 8 }
      : host.getBoundingClientRect();
  const pad = 16;
  const left = hr.left + pad;
  const width = Math.max(240, hr.width - pad * 2);
  const top = br.bottom + 6;
  const maxH = Math.max(160, (hr.bottom || window.innerHeight) - top - pad);
  menu.style.position = "fixed";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${maxH}px`;
  menu.style.zIndex = "20";
}

function syncPickerBtn(select) {
  const wrap = select?.closest(".model-picker");
  const btn = wrap?.querySelector(".model-picker-btn");
  if (!btn) return;
  const opt = select.selectedOptions[0];
  const text = opt?.value
    ? modelShortName(opt.value, opt.textContent)
    : opt?.textContent || "Select";
  btn.replaceChildren();
  if (opt?.value) btn.append(vendorLogo(providerGroup(opt.value)));
  const lab = document.createElement("span");
  lab.textContent = text;
  btn.append(lab);
  btn.title = opt?.value || text;
}

function renderPickerList(wrap, query) {
  const select = wrap.querySelector("select");
  const menu = wrap._menu || wrap.querySelector(".model-picker-menu");
  const list = menu?.querySelector(".model-picker-list");
  const cats = menu?.querySelector(".model-picker-cats");
  if (!select || !list) return;
  const q = String(query || "").trim().toLowerCase();
  const groups = pickerGroups(select);
  const cat = wrap.dataset.cat || "all";
  if (cats) {
    cats.replaceChildren();
    const makeCat = (id, label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "model-picker-cat";
      if (cat === id) b.classList.add("on");
      b.dataset.cat = id;
      b.append(vendorLogo(label));
      const span = document.createElement("span");
      span.textContent = label;
      b.append(span);
      return b;
    };
    cats.append(makeCat("all", "All"));
    for (const g of groups) cats.append(makeCat(catId(g.label), g.label));
  }
  list.replaceChildren();
  const blank = [...select.options].find((o) => o.parentElement === select && !o.value);
  const hit = (s) => !q || String(s || "").toLowerCase().includes(q);
  if (blank && cat === "all" && hit(blank.textContent)) {
    const li = document.createElement("li");
    li.className = "model-picker-item";
    if (!select.value) li.classList.add("on");
    li.dataset.value = "";
    li.textContent = blank.textContent;
    list.append(li);
  }
  for (const g of groups) {
    if (cat !== "all" && catId(g.label) !== cat) continue;
    const items = g.items.filter(
      (it) => hit(it.value) || hit(it.label) || hit(g.label) || hit(modelShortName(it.value, it.label)),
    );
    if (!items.length) continue;
    if (cat === "all") {
      const head = document.createElement("li");
      head.className = "model-picker-group";
      head.append(vendorLogo(g.label));
      const t = document.createElement("span");
      t.textContent = g.label;
      head.append(t);
      list.append(head);
    }
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "model-picker-item";
      if (it.value === select.value) li.classList.add("on");
      li.dataset.value = it.value;
      li.append(vendorLogo(g.label));
      const col = document.createElement("span");
      col.className = "model-picker-copy";
      const name = document.createElement("strong");
      name.textContent = modelShortName(it.value, it.label);
      col.append(name);
      if (!it.value.startsWith("harness:")) {
        const id = document.createElement("span");
        id.className = "id";
        id.textContent = it.value;
        col.append(id);
      }
      li.append(col);
      list.append(li);
    }
  }
  if (!list.children.length) {
    const empty = document.createElement("li");
    empty.className = "model-picker-empty";
    empty.textContent = "No models match.";
    list.append(empty);
  }
}

function pickModelValue(wrap, value) {
  const select = wrap.querySelector("select");
  if (!select) return;
  select.value = value;
  syncPickerBtn(select);
  closeModelPickers();
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function bindModelPicker(select) {
  if (!select || select.closest(".model-picker")) {
    const wrap = select?.closest(".model-picker");
    if (wrap) {
      syncPickerBtn(select);
      if (!wrap.querySelector(".model-picker-menu")?.hidden) renderPickerList(wrap, wrap.querySelector(".model-picker-q")?.value);
    }
    return wrap;
  }
  const wrap = document.createElement("div");
  wrap.className = "model-picker";
  select.parentNode.insertBefore(wrap, select);
  select.classList.add("model-picker-native");
  select.tabIndex = -1;
  wrap.append(select);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "model-picker-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  const menu = document.createElement("div");
  menu.className = "model-picker-menu";
  menu.hidden = true;
  const q = document.createElement("input");
  q.type = "search";
  q.className = "model-picker-q";
  q.placeholder = "Search modelsâ€¦";
  q.autocomplete = "off";
  const body = document.createElement("div");
  body.className = "model-picker-body";
  const cats = document.createElement("div");
  cats.className = "model-picker-cats";
  const list = document.createElement("ul");
  list.className = "model-picker-list";
  body.append(cats, list);
  menu.append(q, body);
  wrap.append(btn, menu);
  wrap._menu = menu;
  menu._wrap = wrap;
  wrap.dataset.cat = "all";
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    const open = menu.hidden;
    closeModelPickers();
    if (!open) return;
    const show = () => {
      pickerHost(wrap).append(menu);
      menu.hidden = false;
      q.value = "";
      wrap.dataset.cat = "all";
      renderPickerList(wrap, "");
      placePickerMenu(wrap);
      q.focus();
    };
    show();
    if (select.id === "bot-model" || select.id === "app-default-model") {
      ensureProviderModels().then(() => {
        if (menu.hidden) return;
        const impl = readImplPicker(select);
        fillImplPicker(
          select,
          impl.harness ? select.dataset.orModel || "" : impl.model,
          impl.harness,
          [...select.options].find((o) => !o.value)?.textContent || "pick a model",
          impl.harnessModel,
        );
        renderPickerList(wrap, q.value);
        placePickerMenu(wrap);
      });
    }
  });
  q.addEventListener("input", () => renderPickerList(wrap, q.value));
  cats.addEventListener("click", (ev) => {
    const b = ev.target.closest(".model-picker-cat");
    if (!b) return;
    wrap.dataset.cat = b.dataset.cat || "all";
    renderPickerList(wrap, q.value);
    q.focus();
  });
  q.addEventListener("keydown", (ev) => {
    const items = [...list.querySelectorAll(".model-picker-item")];
    const i = items.findIndex((el) => el.classList.contains("on"));
    const go = (n) => {
      if (!items.length) return;
      const next = Math.max(0, Math.min(items.length - 1, n));
      items.forEach((el, j) => el.classList.toggle("on", j === next));
      items[next]?.scrollIntoView({ block: "nearest" });
    };
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      go(i < 0 ? 0 : i + 1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      go(i < 0 ? items.length - 1 : i - 1);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const cur = list.querySelector(".model-picker-item.on") || items[0];
      if (cur) pickModelValue(wrap, cur.dataset.value ?? "");
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      menu.hidden = true;
      btn.focus();
    }
  });
  list.addEventListener("click", (ev) => {
    const item = ev.target.closest(".model-picker-item");
    if (!item) return;
    pickModelValue(wrap, item.dataset.value ?? "");
  });
  syncPickerBtn(select);
  return wrap;
}

if (!window.__crewPickerDoc) {
  window.__crewPickerDoc = true;
  document.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".model-picker") || ev.target.closest(".model-picker-menu")) return;
    closeModelPickers();
  });
}

function fillModelSelect(select, current, blank) {
  if (!select) return;
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
  bindModelPicker(select);
}

function readyHarnesses() {
  return (state.bootstrap?.providerCards ?? []).filter(
    (c) => c.id !== "openrouter" && c.enabled && c.installed,
  );
}

async function ensureProviderModels() {
  if (state.providerModels && Date.now() - (state.providerModelsAt || 0) < 60_000) return;
  try {
    state.providerModels = await (await api("/api/providers/models")).json();
    state.providerModelsAt = Date.now();
  } catch {
    state.providerModels = state.providerModels || {};
  }
}

function fillImplPicker(select, model, harness, blank, harnessModel, openRouterOnly) {
  if (!select) return;
  if (openRouterOnly) {
    harness = null;
    harnessModel = "";
  }
  const hm = harnessModel || "";
  const current = harness ? (hm ? `harness:${harness}:${hm}` : `harness:${harness}`) : model || "";
  if (model) select.dataset.orModel = model;
  fillModelSelect(select, harness ? "" : model, blank);
  const catalogs = state.providerModels || {};
  if (!openRouterOnly) {
    for (const c of readyHarnesses()) {
      const group = document.createElement("optgroup");
      group.label = c.label;
      const def = document.createElement("option");
      def.value = `harness:${c.id}`;
      def.textContent = `${c.label} default`;
      group.append(def);
      for (const m of catalogs[c.id] || []) {
        const opt = document.createElement("option");
        opt.value = `harness:${c.id}:${m.id}`;
        opt.textContent = m.label || m.id;
        group.append(opt);
      }
      select.append(group);
    }
  }
  if (current && ![...select.querySelectorAll("option")].some((o) => o.value === current)) {
    const opt = document.createElement("option");
    opt.value = current;
    opt.textContent = hm || harness || current;
    select.append(opt);
  }
  select.value = current;
  bindModelPicker(select);
}

function readImplPicker(select) {
  const raw = select?.value || "";
  if (raw.startsWith("harness:")) {
    const rest = raw.slice("harness:".length);
    const cut = rest.indexOf(":");
    if (cut < 0) return { model: "", harness: rest, harnessModel: "" };
    return { harness: rest.slice(0, cut), harnessModel: rest.slice(cut + 1), model: "" };
  }
  return { model: raw, harness: null, harnessModel: "" };
}

function syncBotFallback() {
  const impl = readImplPicker(document.getElementById("bot-model"));
  const row = document.getElementById("bot-fallback")?.closest(".field");
  if (row) row.hidden = Boolean(impl.harness);
}

function syncModeChip() {
  if (!els.modeBtn) return;
  const on = state.kind === "channel" || state.kind === "dm";
  els.modeBtn.textContent = currentPermissionMode();
  els.modeBtn.disabled = !on || !state.id;
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

function paintEmptyWorkspace() {
  for (const el of document.querySelectorAll(".room-title")) el.textContent = "No rooms yet";
  for (const el of document.querySelectorAll(".draft")) {
    el.placeholder = "Create a channel from the rail â€” @ wakes bots.";
  }
  const plaque = document.getElementById("floor-plaque");
  if (plaque) plaque.textContent = "No rooms yet";
}

const TOUR_STEPS = [
  {
    title: "The office",
    body: "Channels are rooms you own. Bots sit at desks inside them. Everything runs on this machine â€” no cloud, no server.",
  },
  {
    title: "Mentions are the engine",
    body: "A post with @coder wakes only coder. A post with no @ wakes the room's lead. Unmentioned bots wait â€” one turn per bot per post.",
  },
  {
    title: "The desk",
    body: "A woken bot works at its desk with its own tools â€” files, shell, patches â€” then posts a first-person account in the room. If it needs a human, it stops and asks.",
  },
  {
    title: "Direct messages",
    body: "Click a bot on the floor to open a DM. You can read every DM. Bots may DM each other when a handoff needs it.",
  },
  {
    title: "Safety rails",
    body: "supervised asks before every tool. auto-accept writes inside the project only. .env and ~/.ssh are always denied. Switch modes from the header chip.",
  },
];

function slugify(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

function uniqueId(base, taken) {
  const reserved = new Set(["human", "you", "everyone", "engine", "user"]);
  const stem = base || "bot";
  let id = stem;
  let n = 2;
  while (taken.has(id) || reserved.has(id)) id = `${stem}-${n++}`;
  return id;
}

function openOnboarding() {
  const dlg = document.getElementById("onboarding");
  if (!dlg || dlg.open) return;
  if (sessionStorage.getItem("crew.onboard.skip") === "1") return;
  dlg.showModal();
}

function renderTour() {
  const step = TOUR_STEPS[state.tourStep || 0] || TOUR_STEPS[0];
  const title = document.getElementById("tour-title");
  const body = document.getElementById("tour-body");
  const dots = document.getElementById("tour-dots");
  const back = document.getElementById("tour-back");
  const next = document.getElementById("tour-next");
  if (title) title.textContent = step.title;
  if (body) body.textContent = step.body;
  if (dots) {
    dots.replaceChildren();
    TOUR_STEPS.forEach((_, i) => {
      const d = document.createElement("span");
      d.className = `tour-dot${i === (state.tourStep || 0) ? " on" : ""}`;
      dots.append(d);
    });
  }
  if (back) back.hidden = (state.tourStep || 0) === 0;
  if (next) next.textContent = (state.tourStep || 0) >= TOUR_STEPS.length - 1 ? "Done" : "Next";
}

function openTour() {
  const dlg = document.getElementById("tour-modal");
  if (!dlg) return;
  state.tourStep = 0;
  renderTour();
  if (!dlg.open) dlg.showModal();
}

function closeTour() {
  document.getElementById("tour-modal")?.close();
  localStorage.setItem("crew.tour.done", "1");
}

function renderRail() {
  const b = state.bootstrap;
  els.channels.replaceChildren();
  for (const ch of b.channels) {
    const btn = document.createElement("div");
    btn.setAttribute("role", "button");
    btn.tabIndex = 0;
    const icon = ch.icon && ch.icon !== "#" ? ch.icon : "#";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = `${icon}  ${ch.title || ch.id}`;
    btn.title = ch.brief || "No About â€” set CONTEXT.md";
    btn.append(label);
    const unread = unreadOf("channel", ch.id);
    const badge = badgeEl(unread);
    if (badge) btn.append(badge);
    btn.dataset.id = ch.id;
    btn.className = paneShows("channel", ch.id) ? "on" : "";
    btn.onclick = () => {
      if (railPullMoved) return;
      paneOpen(state.activePane, "channel", ch.id);
    };
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
  return `${displayName(p.a)} Â· ${displayName(p.b)}`;
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

function peopleOpenSet() {
  try {
    const raw = JSON.parse(sessionStorage.getItem("crew.peopleOpen") || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function savePeopleOpen(open) {
  try {
    sessionStorage.setItem("crew.peopleOpen", JSON.stringify([...open]));
  } catch {
    /* ignore */
  }
}

function humanChatsFor(botId) {
  return (state.bootstrap?.dms ?? [])
    .filter((d) => d.withHuman && d.b === botId)
    .slice()
    .sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs)));
}

function dmChatButton(row) {
  const btn = document.createElement("div");
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;
  btn.className = "dm-row";
  btn.dataset.id = row.id;
  if (paneShows("dm", row.id)) btn.classList.add("on");
  const title = document.createElement("span");
  title.className = "dm-title";
  title.textContent = row.title || dmHeadline(row.id);
  title.title = title.textContent;
  const sub = document.createElement("span");
  sub.className = "dm-sub";
  const when = dmWhen(row.lastTs);
  const gist = row.lastText ? String(row.lastText).replace(/\s+/g, " ").slice(0, 40) : "New chat";
  sub.textContent = when ? `${when} Â· ${gist}` : gist;
  const col = document.createElement("span");
  col.className = "dm-col";
  col.append(title, sub);
  btn.append(col);
  const unread = unreadOf("dm", row.id);
  const badge = badgeEl(unread);
  if (badge) btn.append(badge);
  btn.onclick = () => {
    if (railPullMoved) return;
    paneOpen(state.activePane, "dm", row.id);
  };
  return btn;
}

async function persistDmPrefs(mutator) {
  const cur = await (await api("/api/dm-prefs")).json();
  const next = mutator(cur);
  await api("/api/dm-prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
  state.bootstrap = await (await api("/api/bootstrap")).json();
  renderRail();
}

function renderDirect() {
  els.direct.replaceChildren();
  const label = document.getElementById("direct-label");
  const rows = (state.bootstrap?.dms ?? []).filter((d) => !d.withHuman && !d.archived);
  if (label) label.hidden = !rows.length;
  els.direct.hidden = !rows.length;
  for (const row of rows) els.direct.append(dmChatButton(row));
}

function renderPeople() {
  els.people.replaceChildren();
  const open = peopleOpenSet();
  const show = (state.bootstrap?.bots ?? []).map((b) => b.id);
  for (const id of show) {
    const face = faceFor(id);
    const block = document.createElement("div");
    block.className = "person-block";
    if (open.has(id)) block.classList.add("open");
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
    label.className = "person-name";
    label.textContent = displayName(id);
    label.title = `${displayName(id)} Â· @${id}`;
    row.append(av, label);
    const live = humanChatsFor(id).filter((d) => !d.archived);
    const unread = live.reduce((n, d) => n + unreadOf("dm", d.id), 0);
    const badge = badgeEl(unread);
    if (badge) row.append(badge);
    row.onclick = () => {
      if (railPullMoved) return;
      if (open.has(id)) open.delete(id);
      else open.add(id);
      savePeopleOpen(open);
      renderPeople();
    };
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add";
    add.title = `New chat with ${displayName(id)}`;
    add.append(ico("plus"));
    add.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      open.add(id);
      savePeopleOpen(open);
      newPersonChat(id).catch((err) => addMessage({ who: "error", text: String(err), kind: "error" }));
    };
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
    wrap.append(row, add, edit, del);
    block.append(wrap);
    const chats = document.createElement("div");
    chats.className = "person-chats";
    for (const rowChat of live) chats.append(dmChatButton(rowChat));
    const archived = humanChatsFor(id).filter((d) => d.archived);
    if (archived.length) {
      const arch = document.createElement("details");
      arch.className = "person-archived";
      const sum = document.createElement("summary");
      sum.textContent = `Archived (${archived.length})`;
      arch.append(sum);
      for (const rowChat of archived) arch.append(dmChatButton(rowChat));
      chats.append(arch);
    }
    if (!live.length && !archived.length) {
      const empty = document.createElement("p");
      empty.className = "desk-empty";
      empty.textContent = "No chats yet. + starts one.";
      chats.append(empty);
    }
    block.append(chats);
    els.people.append(block);
  }
}

const FACES = {
  you: { glyph: "â—", bg: "#2c313a", fg: "#d7dbe2" },
  lead: { glyph: "â—†", bg: "#24344f", fg: "#9bb6e3" },
  designer: { glyph: "âœ¦", bg: "#3f2a38", fg: "#e2b0c8" },
  coder: { glyph: "Î»", bg: "#1d3a36", fg: "#8fd0c1" },
  tester: { glyph: "â–£", bg: "#3a311c", fg: "#ddc07a" },
  researcher: { glyph: "â€»", bg: "#2a382c", fg: "#a9c9a0" },
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
  html = html.replace(/^[-*] (.+)$/gm, "â€¢ $1");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(
    /(^|[^A-Za-z0-9_/])@([A-Za-z][A-Za-z0-9-]*)/g,
    (full, pre, raw) => {
      const id = raw.toLowerCase();
      if (!knownPing(id)) return full;
      const name = id === "everyone" ? "everyone" : displayName(id);
      const tip = `${name} Â· @${id}`;
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

const paneQueue = {};
let sendFaceHtml = "";

function setRunning(on) {
  state.running = on;
  const r = paneRoot(state.runPane);
  const send = r?.querySelector(".send");
  if (send) {
    if (on) {
      if (!sendFaceHtml) sendFaceHtml = send.innerHTML;
      send.classList.remove("primary");
      send.classList.add("danger");
      send.innerHTML = "Stop";
      send.disabled = false;
      syncRunButton();
    } else {
      send.classList.remove("danger");
      send.classList.add("primary");
      send.innerHTML = sendFaceHtml || "Send";
      sendFaceHtml = "";
      send.disabled = false;
      flushQueue();
    }
  }
  if (!on) {
    state.busy.clear();
    state.activity = {};
    renderPresence();
    renderWorkChip();
  }
}

function syncRunButton() {
  if (!state.running) return;
  const r = paneRoot(state.runPane);
  const send = r?.querySelector(".send");
  const draft = r?.querySelector(".draft");
  if (!send) return;
  send.innerHTML = draft?.value.trim() ? "Queue" : "Stop";
}

function queueDraft(idx, text) {
  paneQueue[idx] = [...(paneQueue[idx] ?? []), text];
  renderQueue(idx);
  const r = paneRoot(idx);
  const draft = r?.querySelector(".draft");
  if (draft) {
    draft.value = "";
    draft.style.height = "auto";
  }
  syncRunButton();
}

function renderQueue(idx) {
  const r = paneRoot(idx);
  const box = r?.querySelector(".queue-chips");
  if (!box) return;
  box.replaceChildren();
  for (const [i, q] of (paneQueue[idx] ?? []).entries()) {
    const li = document.createElement("li");
    li.className = "queue-chip";
    const span = document.createElement("span");
    span.textContent = `Queued: ${q.length > 60 ? `${q.slice(0, 58)}â€¦` : q}`;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "Ã—";
    x.title = "Remove from queue";
    x.onclick = () => {
      paneQueue[idx]?.splice(i, 1);
      renderQueue(idx);
      syncRunButton();
    };
    li.append(span, x);
    box.append(li);
  }
  box.hidden = !(paneQueue[idx] ?? []).length;
}

function flushQueue() {
  const idx = state.runPane;
  const next = paneQueue[idx]?.shift();
  renderQueue(idx);
  if (!next) return;
  const r = paneRoot(idx);
  const form = r?.querySelector(".composer");
  const draft = r?.querySelector(".draft");
  if (!form || !draft) return;
  draft.value = next;
  form.requestSubmit();
}

function addWorkingChip(label) {
  const li = document.createElement("li");
  li.className = "msg working";
  const dot = document.createElement("span");
  dot.className = "working-dot";
  const text = document.createElement("span");
  text.className = "working-label";
  text.textContent = label || "Workingâ€¦";
  li.append(dot, text);
  els.log?.append(li);
  pinBottom();
  return li;
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
    parts.push(`${displayName(id)} Â· ${text}`);
  }
  const text = parts.join(" Â· ");
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
      el.textContent = meta.hasSummary ? `${posted}/${k} Â· compacted` : `${posted}/${k}`;
    } catch {
      el.textContent = `${postedOf(pane.kind, pane.id)}/${keep}`;
    }
  }
}

async function maybeAutoCompact(kind, id) {
  if (!kind || !id) return;
  if (state.bootstrap?.autoCompact === false) return;
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
  return cut.length > 22 ? `${cut.slice(0, 20)}â€¦` : cut;
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

const LOOK_SKIN = { light: "#f0d0b0", mid: "#c48a5a", dark: "#6b4423" };
const LOOK_TOP = { hoodie: "#3a5a8c", tee: "#c45c5c", polo: "#2f8a5b", sweater: "#6b3a5a" };

function lookFor(id) {
  const looks = state.looks || { bots: {}, humans: {} };
  if (id === "you") return looks.humans[state.whoId || "human"];
  return looks.bots?.[id];
}

function paintLookSwatches() {
  for (const group of document.querySelectorAll("[data-look]")) {
    const sel = document.getElementById(`look-${group.dataset.look}`);
    const v = sel?.value;
    for (const b of group.querySelectorAll(".floor-swatch")) {
      b.classList.toggle("on", b.dataset.value === v);
    }
  }
}

function fillYouLookSelects() {
  const look = lookFor("you") || { skin: "mid", hair: "short", top: "tee" };
  const skin = document.getElementById("look-skin");
  const hair = document.getElementById("look-hair");
  const top = document.getElementById("look-top");
  if (skin) skin.value = look.skin;
  if (hair) hair.value = look.hair;
  if (top) top.value = look.top;
  paintLookSwatches();
}

async function refreshLooks() {
  try {
    const who = await (await api("/api/who")).json();
    state.whoId = who.id || "human";
    state.looks = await (await api("/api/looks")).json();
  } catch {
    state.whoId = "human";
    state.looks = { bots: {}, humans: {} };
  }
  fillYouLookSelects();
}

let lookTimer = 0;

async function flushYouLook() {
  try {
    state.looks = await (
      await api("/api/looks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skin: document.getElementById("look-skin")?.value,
          hair: document.getElementById("look-hair")?.value,
          top: document.getElementById("look-top")?.value,
        }),
      })
    ).json();
    renderPresence();
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

function saveYouLook() {
  const look = {
    skin: document.getElementById("look-skin")?.value || "mid",
    hair: document.getElementById("look-hair")?.value || "short",
    top: document.getElementById("look-top")?.value || "tee",
  };
  state.looks = state.looks || { bots: {}, humans: {} };
  state.looks.humans = state.looks.humans || {};
  state.looks.humans[state.whoId || "human"] = look;
  renderPresence();
  clearTimeout(lookTimer);
  lookTimer = setTimeout(() => {
    flushYouLook();
  }, 180);
}

function bindFloorLook() {
  const box = document.getElementById("floor-look");
  if (!box || box.dataset.bound) return;
  box.dataset.bound = "1";
  box.addEventListener("change", () => saveYouLook());
  box.addEventListener("click", (ev) => {
    const sw = ev.target.closest(".floor-swatch");
    if (!sw) return;
    const group = sw.closest("[data-look]");
    const sel = document.getElementById(`look-${group?.dataset.look}`);
    if (!sel) return;
    sel.value = sw.dataset.value;
    paintLookSwatches();
    saveYouLook();
  });
}

function floorPose(id) {
  const line = String(state.activity[id] || "");
  if (!line) return "idle";
  if (/^Thinking/i.test(line)) return "thinking";
  if (/^Writing/i.test(line)) return "writing";
  return "working";
}

let floorGame = null;

function ensureFloorGame() {
  if (floorGame) return floorGame;
  const canvas = document.getElementById("floor-canvas");
  if (!canvas) return null;
  floorGame = createFloor(canvas, {
    onPersonClick: (id) => paneOpen(state.activePane, "dm", "human__" + id),
    onDoorClick: (id) => paneOpen(state.activePane, "channel", id),
    onTileClick: (tile) => floorGame.walkTo(tile),
    onFurnitureClick: (id) => removeFurniture(id),
    onPlace: (tile) => placeFurnitureAt(tile),
  });
  window.__floorGame = floorGame;
  return floorGame;
}

function floorLookOf(id) {
  return lookFor(id) || { skin: "mid", hair: "short", top: "tee" };
}

function toTileFurniture(items) {
  return (items ?? []).map((f) => ({ id: f.id, kind: f.kind, x: Math.round(Number(f.x) / 8), y: Math.round(Number(f.y) / 8) }));
}

function renderFloorFurniture(items) {
  state.floorItems = items ?? [];
  ensureFloorGame()?.setState({ furniture: toTileFurniture(state.floorItems) });
}

async function refreshFloorFurniture() {
  if (state.kind !== "channel" || !state.id) {
    state.floorItems = [];
    state.floorFurnRoom = "";
    renderFloorFurniture([]);
    return;
  }
  const room = state.id;
  if (state.floorFurnRoom === room) return;
  state.floorItems = [];
  renderFloorFurniture([]);
  const seq = (state.floorFetchSeq = (state.floorFetchSeq || 0) + 1);
  try {
    const data = await (await api("/api/floor?id=" + encodeURIComponent(room))).json();
    if (seq !== state.floorFetchSeq) return;
    if (state.kind !== "channel" || state.id !== room) return;
    state.floorFurnRoom = room;
    state.floorItems = data.furniture ?? [];
    renderFloorFurniture(state.floorItems);
  } catch {
    if (seq !== state.floorFetchSeq) return;
    if (state.id !== room) return;
    state.floorItems = [];
    renderFloorFurniture([]);
  }
}

function paintFloorHint() {
  const hint = document.getElementById("floor-hint");
  const box = document.getElementById("floor");
  const hold = state.floorHold;
  if (hint) {
    hint.textContent = hold
      ? "Click to place " + hold + " Â· Esc to cancel"
      : state.kind === "channel"
        ? "Click carpet to walk Â· a person to DM Â· drag to pan, wheel to zoom"
        : "Click carpet to walk Â· a door to enter";
  }
  box?.classList.toggle("holding", Boolean(hold));
}

function clearFloorHold() {
  state.floorHold = "";
  const kit = els.floorKit;
  if (kit) {
    for (const el of kit.querySelectorAll("[data-kind]")) el.classList.remove("on");
  }
  ensureFloorGame()?.setHold("");
  paintFloorHint();
}

async function placeFurnitureAt(tile) {
  const kind = state.floorHold;
  if (!kind || inviteToken() || state.kind !== "channel" || !state.id) return;
  const furniture = [
    ...(state.floorItems ?? []),
    { id: "f" + Date.now().toString(36), kind, x: tile.x * 8, y: tile.y * 8 },
  ];
  try {
    const saved = await (
      await api("/api/floor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: state.id, furniture }),
      })
    ).json();
    state.floorFurnRoom = state.id;
    state.floorItems = saved.furniture ?? furniture;
    renderFloorFurniture(state.floorItems);
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

async function removeFurniture(id) {
  if (inviteToken() || state.kind !== "channel" || !state.id) return;
  const furniture = (state.floorItems ?? []).filter((f) => f.id !== id);
  try {
    const saved = await (
      await api("/api/floor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: state.id, furniture }),
      })
    ).json();
    state.floorFurnRoom = state.id;
    state.floorItems = saved.furniture ?? furniture;
    renderFloorFurniture(state.floorItems);
  } catch (err) {
    addMessage({ who: "error", text: String(err), kind: "error" });
  }
}

function bindFloorKit() {
  const kit = els.floorKit;
  if (!kit || kit.dataset.bound) return;
  kit.dataset.bound = "1";
  kit.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-kind]");
    if (!btn) return;
    ev.stopPropagation();
    const kind = btn.dataset.kind;
    state.floorHold = state.floorHold === kind ? "" : kind;
    for (const el of kit.querySelectorAll("[data-kind]")) {
      el.classList.toggle("on", el.dataset.kind === state.floorHold);
    }
    ensureFloorGame()?.setHold(state.floorHold);
    paintFloorHint();
  });
  if (!kit.dataset.boundEsc) {
    kit.dataset.boundEsc = "1";
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && state.floorHold) {
        ev.preventDefault();
        clearFloorHold();
      }
    });
  }
}

function renderFloorDoors() {
  const channels = state.bootstrap?.channels ?? [];
  const here = state.kind === "channel" ? state.id : "";
  const others = channels.filter((ch) => ch.id !== here);
  ensureFloorGame()?.setState({
    doors: others.map((ch) => ({ id: ch.id, label: ch.id, title: ch.title || ch.id })),
  });
}

function renderFloor(hereIds, leadId) {
  const game = ensureFloorGame();
  bindFloorKit();
  renderFloorDoors();
  if (els.floorKit) els.floorKit.hidden = Boolean(inviteToken()) || state.kind !== "channel";
  paintFloorHint();
  refreshFloorFurniture();
  const plaque = els.floorPlaque;
  if (plaque) {
    plaque.textContent =
      state.kind === "channel" && state.id ? "#" + state.id : "desk";
  }
  if (!game) return;
  const members = hereIds.map((id) => ({
    id,
    name: displayName(id),
    look: floorLookOf(id),
    activity: state.activity[id] || "",
    pose: floorPose(id),
    lead: id === leadId,
  }));
  game.setState({
    members,
    furniture: toTileFurniture(state.floorItems),
    you: { look: floorLookOf("you"), home: isoYouHome(hereIds.length) },
  });
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
    if (els.deskLabel) els.deskLabel.textContent = `Members â€” ${hereIds.length}`;
  } else {
    const dm = parseDm(state.id);
    hereIds = dm.withHuman ? [dm.b] : [dm.a, dm.b].filter(Boolean);
    if (els.deskLabel) els.deskLabel.textContent = "Online";
  }
  const byId = new Map(bots.map((b) => [b.id, b]));
  const present = hereIds.filter((id) => byId.has(id));
  renderFloor(present, leadId);
  for (const id of present) {
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
  avatar.title = isYou ? "You" : `${displayName(id)} Â· @${id}`;

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
  floorGame?.say(botId, text);
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

function appendTool(botId, name, args, output, shot) {
  if (!name && !shot) return;
  if (state.running) setActivity(botId, activityLabel(name, args));
  const turn = ensureTurn(botId);
  const path = shot || (String(output ?? "").match(/\.crew\/browser\/shots\/[A-Za-z0-9._-]+\.png/) || [])[0];
  const last = turn.toolList.lastElementChild;
  const merge =
    last &&
    last.dataset.name === String(name ?? "") &&
    !last.querySelector("img");
  const li = merge ? last : document.createElement("li");
  if (!merge) {
    turn.tools.hidden = false;
    turn.toolCount += 1;
    turn.toolsSum.textContent = turn.toolCount === 1 ? "1 tool" : `${turn.toolCount} tools`;
    li.dataset.name = String(name ?? "");
    li.textContent = shot ? (toolLabel(name, args) || "screenshot") : toolLabel(name, args);
    turn.toolList.append(li);
  }
  if (path && !li.querySelector("img")) {
    const img = document.createElement("img");
    img.className = "desk-shot";
    img.alt = "Browser screenshot";
    img.src = `/api/shot?path=${encodeURIComponent(path)}`;
    li.append(img);
  }
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
        return `429 rate-limited${who ? ` via ${who}` : ""}. Free shared pool is full. Wait 30â€“60s, tag one bot, or switch model.`;
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
    return "429 rate-limited. Free shared pool is full. Wait 30â€“60s, tag one bot, or switch model.";
  }
  if (jsonAt >= 0) return raw.replace(/\s+/g, " ").slice(0, 220);
  return raw.length > 400 ? `${raw.slice(0, 400)}â€¦` : raw;
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

function inviteToken() {
  return String(localStorage.getItem("crew.inviteToken") || "").trim();
}

function inviteHeaders(extra) {
  const headers = extra instanceof Headers
    ? Object.fromEntries(extra.entries())
    : { ...(extra || {}) };
  const token = inviteToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function paintWhoChip() {
  const token = inviteToken();
  const input = document.getElementById("who-token");
  const label = document.getElementById("who-label");
  const chip = document.getElementById("who-chip");
  if (input && input.value !== token) input.value = token;
  if (!label) return;
  chip?.classList.remove("invalid");
  if (!token) {
    label.textContent = "owner";
    return;
  }
  api("/api/who")
    .then((res) => res.json())
    .then((who) => {
      chip?.classList.remove("invalid");
      label.textContent = String(who.handle || who.id || "invite");
    })
    .catch(() => {
      chip?.classList.add("invalid");
      label.textContent = "invalid";
    });
}

function bindWhoChip() {
  const input = document.getElementById("who-token");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  input.value = inviteToken();
  paintWhoChip();
  const save = () => {
    const raw = input.value.trim();
    if (raw) localStorage.setItem("crew.inviteToken", raw);
    else localStorage.removeItem("crew.inviteToken");
    paintWhoChip();
  };
  input.addEventListener("change", save);
  input.addEventListener("blur", save);
  input.addEventListener("input", save);
}

function httpErrorMessage(raw) {
  try {
    const data = JSON.parse(raw);
    if (data && typeof data.error === "string" && data.error.trim()) return data.error.trim();
  } catch {
    /* not json */
  }
  return raw;
}

async function api(path, opts) {
  const next = { ...(opts || {}) };
  next.headers = inviteHeaders(next.headers);
  const res = await fetch(path, next);
  if (!res.ok) throw new Error(httpErrorMessage((await res.text()) || res.statusText));
  return res;
}

function setRailOpen(on) {
  document.querySelector(".rail")?.classList.toggle("open", on);
  const scrim = document.getElementById("nav-scrim");
  if (scrim) scrim.hidden = !on;
}

function paintRoomBrief(ch) {
  if (!els.brief) return;
  els.brief.hidden = false;
  const brief = String(ch?.brief ?? "").trim();
  if (brief) {
    els.brief.textContent = brief;
    els.brief.classList.remove("empty");
    els.brief.title = "Room About â€” CONTEXT.md, loaded every turn";
  } else {
    els.brief.textContent = "No About â€” bots will ask, not invent.";
    els.brief.classList.add("empty");
    els.brief.title = "Set About on this room";
  }
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
    paintRoomBrief(ch);
  } else {
    const dm = parseDm(id);
    if (els.kicker) {
      els.kicker.textContent = dm.withHuman ? "with you" : dmSubline({ withHuman: false, a: dm.a, b: dm.b });
    }
    if (els.title) els.title.textContent = dmHeadline(id);
    if (els.brief) {
      els.brief.hidden = true;
      els.brief.textContent = "";
    }
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
      appendTool(row.botId, row.name, row.args, row.output, row.shot);
    } else if (row.type === "error") {
      addMessage({
        who: `@${row.botId}`,
        botId: row.botId,
        text: row.text,
        kind: "error",
      });
    } else if (row.type === "held" || row.type === "ignored") {
      const li = document.createElement("li");
      li.className = "status";
      li.textContent = row.text;
      els.log?.append(li);
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

const ICONS = ["Î»","â—†","âœ¦","â€»","â–£","â—","â–²","â– ","â˜…","âš™","âœŽ","âŒ‚","âš‘","â—Ž","â—‡","â–³","â–¶","âŒ˜","âˆž","#","@","Î£","Î©","Î¼","Ï€","â—‰"];
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
    `---\nname: ${name || "â€¦"}\ndescription: ${JSON.stringify(desc || "â€¦")}\n---\n\n${body || "â€¦ "}\n`;
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
    ? `@${id} Â· ${existing}`
    : `@${id} Â· new`;
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
  const n = workspaceRelPath(raw, state.bootstrap?.cwd);
  if (!n || chPaths.includes(n)) return;
  chPaths.push(n);
  renderChPaths();
}

async function addResolvedChPath(raw) {
  const cwd = state.bootstrap?.cwd ?? "";
  const picked = workspaceRelPath(raw, cwd);
  if (!picked) return;
  const leaf = picked.split("/").pop();
  let listed = [];
  try {
    const data = await (await api(`/api/paths?q=${encodeURIComponent(leaf)}`)).json();
    listed = data.paths ?? [];
  } catch {
    listed = [];
  }
  addChPath(resolveWorkspaceHint(picked, listed));
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
    fillImplPicker(
      document.getElementById("bot-model"),
      data.model,
      data.harness,
      "workspace default",
      data.harnessModel,
    );
    ensureProviderModels().then(() => {
      if (state.editBotId !== id) return;
      fillImplPicker(
        document.getElementById("bot-model"),
        data.model,
        data.harness,
        "workspace default",
        data.harnessModel,
      );
      syncBotFallback();
    });
    fillImplPicker(document.getElementById("bot-fallback"), data.fallbackModel, null, "workspace fallback");
    syncBotFallback();
    fillImplPicker(document.getElementById("bot-title-model"), data.titleModel, null, "Jobs Title default");
    const effortSel = document.getElementById("bot-effort");
    if (effortSel) effortSel.value = data.effort || "";
    paintFace(document.getElementById("bot-face"), data.icon, id);
    renderSkills(data.skills ?? []);
    clearSkillForm();
    setSkillOpenEnabled(true);
    fillBotRooms(id, false);
    const look = (state.looks?.bots ?? {})[id] || { skin: "mid", hair: "short", top: "tee" };
    const skin = document.getElementById("bot-skin");
    const hair = document.getElementById("bot-hair");
    const top = document.getElementById("bot-top");
    if (skin) skin.value = look.skin;
    if (hair) hair.value = look.hair;
    if (top) top.value = look.top;
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
        paintEmptyWorkspace();
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
        paintEmptyWorkspace();
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
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost";
      del.textContent = "Remove";
      del.onclick = async () => {
        const q = new URLSearchParams({ tool: r.tool, key: r.key });
        await api(`/api/permissions?${q}`, { method: "DELETE" });
        await renderAlways();
      };
      li.append(name, desc, del);
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
  const impl = readImplPicker(document.getElementById("bot-model"));
  const patch = {
    icon: document.getElementById("bot-icon").value.trim(),
    name: document.getElementById("bot-name").value.trim() || id,
    soul: document.getElementById("bot-soul").value,
    standingOrders: document.getElementById("bot-orders").value,
    fallbackModel: document.getElementById("bot-fallback").value,
    titleModel: document.getElementById("bot-title-model").value,
    harness: impl.harness,
    harnessModel: impl.harness ? impl.harnessModel || "" : null,
    effort: document.getElementById("bot-effort")?.value ?? "",
  };
  if (!impl.harness) patch.model = impl.model;
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
    state.looks = await (
      await api("/api/looks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: id,
          skin: document.getElementById("bot-skin")?.value,
          hair: document.getElementById("bot-hair")?.value,
          top: document.getElementById("bot-top")?.value,
        }),
      })
    ).json();
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
  bindWhoChip();
  state.bootstrap = await (await api("/api/bootstrap")).json();
  await refreshLooks();
  fillAppTop();
  applyDesk();
  renderRail();
  const first = state.bootstrap.channels[0];
  if (first) await paneOpen(0, "channel", first.id);
  else {
    paintEmptyWorkspace();
    openOnboarding();
  }
  await restoreSplit();
  startWatch();
  void checkForUpdateQuietly();
}

document.getElementById("tour-next")?.addEventListener("click", () => {
  if ((state.tourStep || 0) >= TOUR_STEPS.length - 1) closeTour();
  else {
    state.tourStep = (state.tourStep || 0) + 1;
    renderTour();
  }
});
document.getElementById("tour-back")?.addEventListener("click", () => {
  state.tourStep = Math.max(0, (state.tourStep || 0) - 1);
  renderTour();
});
document.getElementById("tour-close")?.addEventListener("click", closeTour);
document.getElementById("tour-replay")?.addEventListener("click", () => {
  document.getElementById("app-modal")?.close();
  openTour();
});
document.getElementById("onboard-skip")?.addEventListener("click", () => {
  sessionStorage.setItem("crew.onboard.skip", "1");
  document.getElementById("onboarding")?.close();
});
document.getElementById("onboard-tour")?.addEventListener("click", () => {
  document.getElementById("onboarding")?.close();
  openTour();
});
document.getElementById("onboard-form")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const errBox = document.getElementById("onboard-error");
  if (errBox) errBox.hidden = true;
  const channelName =
    document.getElementById("onboard-channel")?.value.trim() || "General";
  const leadName = document.getElementById("onboard-lead")?.value.trim() || "Lead";
  const mateName = document.getElementById("onboard-teammate")?.value.trim() || "";
  const mode = document.getElementById("onboard-mode")?.value || "auto-accept";
  const taken = new Set((state.bootstrap?.bots ?? []).map((b) => b.id));
  const leadId = uniqueId(slugify(leadName), taken);
  taken.add(leadId);
  const bots = [{ id: leadId, name: leadName, icon: "\u{1F9ED}" }];
  if (mateName) {
    const mateId = uniqueId(slugify(mateName), taken);
    taken.add(mateId);
    bots.push({ id: mateId, name: mateName, icon: "\u{1F4BB}" });
  }
  const btn = document.getElementById("onboard-start");
  if (btn) btn.disabled = true;
  try {
    for (const bot of bots) {
      await api("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bot),
      });
    }
    const channelTaken = new Set((state.bootstrap?.channels ?? []).map((c) => c.id));
    const channelId = uniqueId(slugify(channelName), channelTaken);
    await api("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: channelId,
        title: channelName,
        memberBotIds: bots.map((b) => b.id),
        leadBotId: leadId,
        permissionMode: mode,
      }),
    });
    document.getElementById("onboarding")?.close();
    state.bootstrap = await (await api("/api/bootstrap")).json();
    renderRail();
    await paneOpen(0, "channel", channelId);
    if (localStorage.getItem("crew.tour.done") !== "1") openTour();
  } catch (err) {
    if (errBox) {
      errBox.textContent = String(err?.message || err);
      errBox.hidden = false;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
});


document.getElementById("desk-toggle")?.addEventListener("click", () => {
  state.deskOpen = !state.deskOpen;
  applyDesk();
});
document.getElementById("app-top")?.addEventListener("dblclick", (ev) => {
  if (ev.target.closest("button, input, label")) return;
  if (isDesktopShell()) windowCall("toggle");
});
document.getElementById("win-min")?.addEventListener("click", () => windowCall("minimize"));
document.getElementById("win-max")?.addEventListener("click", () => windowCall("toggle"));
document.getElementById("win-close")?.addEventListener("click", () => windowCall("close"));
document.getElementById("win-open-project")?.addEventListener("click", () => {
  windowCall("openProject");
});

document.getElementById("mode-close").onclick = () => els.modeModal.close();
document.getElementById("mode-list").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-mode]");
  if (!btn || (state.kind !== "channel" && state.kind !== "dm")) return;
  const mode = btn.dataset.mode;
  try {
    await api("/api/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: state.id, mode }),
    });
    const ch = currentChannel();
    if (ch) ch.permissionMode = mode;
    const dm = currentDm();
    if (dm) dm.permissionMode = mode;
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
    btn.textContent = `${id}  Ã—`;
    btn.title = "Remove";
    btn.onclick = () => {
      persistAllowed(allowedModels().filter((x) => x !== id));
    };
    box.append(btn);
  }
}

function fillSettingsSelects() {
  fillImplPicker(
    document.getElementById("app-default-model"),
    state.bootstrap.model,
    state.bootstrap.defaultHarness,
    "pick a model",
    state.bootstrap.defaultHarnessModel,
  );
  fillImplPicker(
    document.getElementById("app-fallback-model"),
    state.bootstrap.fallbackModel,
    null,
    "none",
  );
  fillImplPicker(
    document.getElementById("app-reviewer-model"),
    state.bootstrap.reviewerModel ?? "",
    null,
    "Off (auto â†’ supervised)",
  );
  const mode = document.getElementById("app-default-mode");
  if (mode) mode.value = state.bootstrap.defaultPermissionMode || "auto-accept";
  const compact = document.getElementById("app-auto-compact");
  if (compact) compact.checked = state.bootstrap.autoCompact !== false;
  const base = document.getElementById("app-base-url");
  if (base) base.value = state.bootstrap.baseUrl || "";
  const path = document.getElementById("app-workspace-path");
  if (path) path.textContent = state.bootstrap.cwd || "";
  const ver = document.getElementById("app-about-ver");
  if (ver) ver.textContent = state.bootstrap.version || "";
  const upd = document.getElementById("app-update-url");
  if (upd) upd.value = state.bootstrap.updateUrl || "";
  const auto = document.getElementById("app-update-auto");
  if (auto) auto.checked = state.bootstrap.autoUpdate !== false;
}

function providerFileFromCards() {
  const body = {
    openrouter: { enabled: true },
    claude: { enabled: false, binary: "" },
    codex: { enabled: false, binary: "" },
    grok: { enabled: false, binary: "" },
    opencode: { enabled: false, binary: "" },
  };
  for (const card of document.querySelectorAll("[data-harness]")) {
    const id = card.dataset.harness;
    if (!body[id]) continue;
    body[id] = {
      enabled: Boolean(card.querySelector("[data-prov-on]")?.checked),
      binary: card.querySelector("[data-prov-bin]")?.value?.trim() || "",
      customModels: [...card.querySelectorAll("[data-custom-chip]")].map((el) => el.dataset.id).filter(Boolean),
    };
  }
  return body;
}

function paintProviderCards() {
  const cards = state.bootstrap?.providerCards ?? [];
  const file = state.bootstrap?.providers ?? {};
  const orPill = document.getElementById("prov-openrouter-pill");
  const orStatus = document.getElementById("prov-openrouter-status");
  if (orPill) orPill.textContent = state.bootstrap?.keySet ? "Ready" : "Needs key";
  if (orStatus) {
    orStatus.textContent = state.bootstrap?.keySet
      ? "Crew engine Â· key saved"
      : "Crew engine Â· add an API key";
  }
  const orCard = document.getElementById("prov-openrouter");
  if (orCard) orCard.dataset.status = state.bootstrap?.keySet ? "ready" : "missing";
  for (const card of document.querySelectorAll("[data-harness]")) {
    const id = card.dataset.harness;
    const row = cards.find((c) => c.id === id);
    const slot = file[id] || {};
    const on = card.querySelector("[data-prov-on]");
    const bin = card.querySelector("[data-prov-bin]");
    const status = card.querySelector("[data-prov-status]");
    const pill = card.querySelector("[data-prov-pill]");
    const login = card.querySelector("[data-prov-login]");
    const enabled = Boolean(row?.enabled ?? slot.enabled);
    if (on) on.checked = enabled;
    if (bin && document.activeElement !== bin) bin.value = row?.binary || slot.binary || "";
    const st = row?.status || (enabled ? "missing" : "off");
    card.dataset.status = st;
    if (enabled || card.classList.contains("open")) card.classList.add("open");
    else card.classList.remove("open");
    if (enabled) card.classList.add("open");
    if (status) {
      if (st === "ready") {
        status.textContent = [row?.version, row?.which].filter(Boolean).join(" Â· ") || "Ready";
      } else if (st === "installed") status.textContent = row?.version ? `Installed Â· ${row.version}` : "Installed â€” enable to use";
      else if (st === "missing") status.textContent = "Not installed";
      else status.textContent = "Off";
    }
    if (pill) {
      pill.textContent =
        st === "ready" ? "Ready" : st === "installed" ? "Installed" : st === "missing" ? "Missing" : "Off";
    }
    if (login) {
      login.textContent = row?.login ? `Log in: ${row.login}` : "";
    }
    const mark = card.querySelector(".provider-mark");
    if (mark && !mark.dataset.ink) {
      mark.dataset.ink = "1";
      mark.replaceChildren(vendorLogo(id));
    }
    const box = card.querySelector("[data-prov-customs]");
    if (box) {
      box.replaceChildren();
      for (const mid of slot.customModels || []) {
        box.append(customModelChip(mid));
      }
    }
  }
}

function customModelChip(id) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "custom-chip";
  b.dataset.customChip = "";
  b.dataset.id = id;
  b.textContent = `${id} Ã—`;
  b.title = "Remove";
  return b;
}

async function refreshProviderHealth() {
  for (const el of document.querySelectorAll("[data-prov-status]")) {
    if (el.closest("[data-harness]")?.querySelector("[data-prov-on]")?.checked) {
      /* keep */
    }
    const card = el.closest("[data-harness]");
    if (card && !card.dataset.status) el.textContent = "Checkingâ€¦";
  }
  try {
    const data = await (await api("/api/providers/health")).json();
    if (Array.isArray(data.cards)) state.bootstrap.providerCards = data.cards;
    paintProviderCards();
    const botModel = document.getElementById("bot-model");
    if (document.getElementById("bot-modal")?.open && botModel) {
      const cur = readImplPicker(botModel);
      fillImplPicker(botModel, cur.model, cur.harness, "workspace default");
      syncBotFallback();
    }
  } catch (err) {
    toast(String(err));
  }
}

async function persistProviders() {
  const saved = await (
    await api("/api/providers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(providerFileFromCards()),
    })
  ).json();
  state.bootstrap.providers = saved;
  state.providerModels = null;
  state.providerModelsAt = 0;
  await refreshProviderHealth();
  await ensureProviderModels();
  fillSettingsSelects();
  fillJobs();
}

function fillBotSelect(select, current, blank) {
  if (!select) return;
  const bots = state.bootstrap?.bots ?? [];
  select.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = blank || "(none)";
  select.append(none);
  for (const b of bots) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name || b.id;
    select.append(opt);
  }
  select.value = current || "";
}

function jobFromPicker(select) {
  const impl = readImplPicker(select);
  return {
    model: impl.harness ? "" : impl.model,
    botId: null,
    harness: impl.harness,
    harnessModel: impl.harness ? impl.harnessModel || "" : null,
  };
}

async function fillJobs() {
  let jobs = {
    title: { model: "", botId: null, harness: null, harnessModel: null },
    compact: { model: "", botId: null, harness: null, harnessModel: null },
    vision: { model: "", botId: null, harness: null, harnessModel: null },
    read: { model: "", botId: null, harness: null, harnessModel: null },
  };
  try {
    jobs = await (await api("/api/jobs")).json();
  } catch {
    /* defaults */
  }
  const row = (el, job, blank) =>
    fillImplPicker(el, job?.model ?? "", job?.harness, blank, job?.harnessModel, true);
  row(document.getElementById("job-title-model"), jobs.title, "Default");
  row(document.getElementById("job-compact-bot"), jobs.compact, "Default");
  row(document.getElementById("job-vision-bot"), jobs.vision, "Off");
  row(document.getElementById("job-read-bot"), jobs.read, "Off");
}

async function persistJobs() {
  const body = {
    title: jobFromPicker(document.getElementById("job-title-model")),
    compact: jobFromPicker(document.getElementById("job-compact-bot")),
    vision: jobFromPicker(document.getElementById("job-vision-bot")),
    read: jobFromPicker(document.getElementById("job-read-bot")),
  };
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
  paintProviderCards();
}

async function loadCatalog(q) {
  const box = document.getElementById("catalog");
  const query = String(q || "").trim();
  if (query.length < 2) {
    box.textContent = "Type 2+ characters to search OpenRouter.";
    return;
  }
  box.textContent = "Searchingâ€¦";
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

function switchSettingsTab(name) {
  const tab = name || "general";
  closeModelPickers();
  for (const btn of document.querySelectorAll("[data-settings-tab]")) {
    btn.classList.toggle("on", btn.dataset.settingsTab === tab);
  }
  for (const panel of document.querySelectorAll("[data-settings-panel]")) {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  }
}

let mcpDraft = [];

function emptyMcpServer() {
  return { name: "", enabled: true, command: "", args: [], env: {} };
}

function renderMcp() {
  const box = document.getElementById("mcp-list");
  if (!box) return;
  box.replaceChildren();
  if (!mcpDraft.length) {
    const p = document.createElement("p");
    p.className = "field-hint";
    p.textContent = "No servers yet. Add a stdio command (for example npx -y @modelcontextprotocol/server-filesystem .).";
    box.append(p);
    return;
  }
  mcpDraft.forEach((row, i) => {
    const card = document.createElement("article");
    card.className = "mcp-card";
    const top = document.createElement("div");
    top.className = "mcp-card-top";
    const name = document.createElement("input");
    name.placeholder = "name";
    name.value = row.name;
    name.oninput = () => {
      mcpDraft[i].name = name.value;
    };
    const on = document.createElement("label");
    on.className = "check-row";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = row.enabled !== false;
    check.onchange = () => {
      mcpDraft[i].enabled = check.checked;
    };
    on.append(check, document.createTextNode(" Enable"));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "Remove";
    del.onclick = () => {
      mcpDraft.splice(i, 1);
      renderMcp();
    };
    top.append(name, on, del);
    const cmd = document.createElement("input");
    cmd.placeholder = "command (npx, bun, python, â€¦)";
    cmd.value = row.command || "";
    cmd.spellcheck = false;
    cmd.oninput = () => {
      mcpDraft[i].command = cmd.value;
    };
    const args = document.createElement("input");
    args.placeholder = "args, space-separated";
    args.value = Array.isArray(row.args) ? row.args.join(" ") : "";
    args.spellcheck = false;
    args.oninput = () => {
      mcpDraft[i].args = args.value.trim() ? args.value.trim().split(/\s+/) : [];
    };
    const url = document.createElement("input");
    url.placeholder = "or HTTP URL (JSON-RPC / SSE)";
    url.value = row.url || "";
    url.spellcheck = false;
    url.oninput = () => {
      mcpDraft[i].url = url.value.trim();
    };
    const env = document.createElement("textarea");
    env.rows = 2;
    env.placeholder = "env KEY=value, one per line";
    env.value = row.env
      ? Object.entries(row.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")
      : "";
    env.spellcheck = false;
    env.oninput = () => {
      const next = {};
      for (const line of env.value.split("\n")) {
        const cut = line.indexOf("=");
        if (cut < 1) continue;
        next[line.slice(0, cut).trim()] = line.slice(cut + 1).trim();
      }
      mcpDraft[i].env = next;
    };
    card.append(top, cmd, args, url, env);
    box.append(card);
  });
}

async function loadMcp() {
  try {
    const data = await (await api("/api/mcp")).json();
    mcpDraft = Array.isArray(data.servers) ? data.servers.map((s) => ({ ...s })) : [];
  } catch {
    mcpDraft = [];
  }
  renderMcp();
  refreshMcpTools();
}

async function refreshMcpTools() {
  const meta = document.getElementById("mcp-tools-meta");
  if (!meta) return;
  try {
    const data = await (await api("/api/mcp/tools")).json();
    const n = Array.isArray(data.tools) ? data.tools.length : 0;
    meta.textContent = n ? `${n} tool${n === 1 ? "" : "s"} on Crew-native turns` : "No live tools (enable a server and Save).";
  } catch {
    meta.textContent = "Could not list MCP tools.";
  }
}

async function loadInvites() {
  const list = document.getElementById("invite-list");
  if (!list) return;
  try {
    const data = await (await api("/api/humans")).json();
    list.replaceChildren();
    for (const h of data.humans ?? []) {
      const li = document.createElement("li");
      li.className = "invite-row-item";
      const meta = document.createElement("span");
      meta.textContent = `${h.handle} (@${h.id})${h.invited ? "" : " â€” revoked"}`;
      const rev = document.createElement("button");
      rev.type = "button";
      rev.className = "danger";
      rev.textContent = "Revoke";
      rev.disabled = !h.invited;
      rev.onclick = async () => {
        try {
          await api("/api/humans/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: h.id }),
          });
          await loadInvites();
        } catch (err) {
          const once = document.getElementById("invite-once");
          if (once) {
            once.hidden = false;
            once.textContent = String(err);
          }
        }
      };
      li.append(meta, rev);
      list.append(li);
    }
    if (!list.children.length) {
      const empty = document.createElement("li");
      empty.className = "field-hint";
      empty.textContent = "No extra people yet.";
      list.append(empty);
    }
  } catch (err) {
    list.textContent = String(err);
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
  loadMcp();
  renderAlways();
  paintProviderCards();
  refreshProviderHealth();
  ensureProviderModels().then(() => {
    fillSettingsSelects();
    fillJobs();
  });
  switchSettingsTab("general");
  const once = document.getElementById("invite-once");
  if (once) {
    once.hidden = true;
    once.textContent = "";
  }
  loadInvites();
  els.appModal.showModal();
  document.getElementById("model-search").value = "";
  loadCatalog("");
}

document.getElementById("invite-create")?.addEventListener("click", async () => {
  const id = document.getElementById("invite-id")?.value.trim() ?? "";
  const handle = document.getElementById("invite-handle")?.value.trim() ?? "";
  const once = document.getElementById("invite-once");
  try {
    const res = await (await api("/api/humans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, handle: handle || id }),
    })).json();
    if (once) {
      once.hidden = false;
      once.textContent = `Token (once): ${res.token}`;
    }
    const idEl = document.getElementById("invite-id");
    const handleEl = document.getElementById("invite-handle");
    if (idEl) idEl.value = "";
    if (handleEl) handleEl.value = "";
    await loadInvites();
  } catch (err) {
    if (once) {
      once.hidden = false;
      once.textContent = String(err);
    }
  }
});

els.appSettings.addEventListener("click", () => openAppSettings());
document.getElementById("settings-tabs")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-settings-tab]");
  if (!btn) return;
  switchSettingsTab(btn.dataset.settingsTab);
  if (btn.dataset.settingsTab === "mcp") refreshMcpTools();
});
document.getElementById("mcp-add")?.addEventListener("click", () => {
  mcpDraft.push(emptyMcpServer());
  renderMcp();
});
document.getElementById("mcp-save")?.addEventListener("click", async () => {
  try {
    const saved = await (
      await api("/api/mcp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servers: mcpDraft }),
      })
    ).json();
    mcpDraft = Array.isArray(saved.servers) ? saved.servers.map((s) => ({ ...s })) : mcpDraft;
    renderMcp();
    refreshMcpTools();
    toast("MCP saved.");
  } catch (err) {
    toast(String(err));
  }
});
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
  const impl = readImplPicker(ev.target);
  if (!impl.harness && !impl.model) return;
  const res = await (
    await api("/api/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: impl.model,
        harness: impl.harness,
        harnessModel: impl.harnessModel,
      }),
    })
  ).json();
  state.bootstrap.model = res.model;
  state.bootstrap.defaultHarness = res.harness ?? null;
  state.bootstrap.defaultHarnessModel = res.harnessModel ?? "";
});
for (const id of ["job-title-model", "job-compact-bot", "job-vision-bot", "job-read-bot"]) {
  document.getElementById(id)?.addEventListener("change", () => {
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
    if (state.floorHold) {
      clearFloorHold();
      return;
    }
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
    if (state.kind !== "channel" && state.kind !== "dm") return;
    const current = currentPermissionMode();
    const next = order[(order.indexOf(current) + 1) % order.length];
    api("/api/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: state.id, mode: next }),
    }).then(() => {
      const ch = currentChannel();
      if (ch) ch.permissionMode = next;
      const dm = currentDm();
      if (dm) dm.permissionMode = next;
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
  if (state.running) {
    if (text) queueDraft(idx, text);
    return;
  }
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
  let workingEl = null;
  try {
      setRunning(true);
      workingEl = addWorkingChip("Workingâ€¦");
      const res = await fetch("/api/say", {
        method: "POST",
        headers: inviteHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(
          runKind === "dm"
            ? { kind: "dm", id: runId, text, thinking: true, verbose: true }
            : { channelId: runId, text, thinking: true, verbose: true },
        ),
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
            workingEl?.querySelector(".working-label")?.replaceChildren(row.message);
            const who = String(row.message).split("â†’")[0]?.trim();
            if (who) setActivity(who, "Calling model");
            pinBottom();
          } else if (row.type === "text") {
            workingEl?.remove();
            workingEl = null;
            appendAccount(row.botId, row.text, false);
          } else if (row.type === "thinking") {
            appendThinking(row.botId, row.text);
          } else if (row.type === "tool") {
            workingEl?.remove();
            workingEl = null;
            appendTool(row.botId, row.name, row.args, row.output, row.shot);
          } else if (row.type === "ask") {
            showAsk(row);
          } else if (row.type === "error") {
            workingEl?.remove();
            workingEl = null;
            addMessage({
              who: `@${row.botId ?? "engine"}`,
              botId: row.botId,
              text: row.message,
              kind: "error",
            });
          } else if (row.type === "done") {
            workingEl?.remove();
            workingEl = null;
            if (row.ignored?.text) {
              const li = document.createElement("li");
              li.className = "status";
              li.textContent = row.ignored.text;
              els.log?.append(li);
            }
            if (row.held?.text) {
              const li = document.createElement("li");
              li.className = "status";
              li.textContent = row.held.text;
              els.log?.append(li);
            }
            if (currentTurn) currentTurn.sealed = true;
            state.bootstrap = await (await api("/api/bootstrap")).json();
            markRead(runKind, runId);
            renderRail();
            await maybeAutoCompact(runKind, runId);
            await renderContextChip();
          }
        }
      }
  } catch (err) {
    bindPane(state.runPane);
    workingEl?.remove();
    workingEl = null;
    addMessage({ who: "error", text: connectionLostMessage(err), kind: "error" });
  }
  workingEl?.remove();
  workingEl = null;
  setRunning(false);
  bindPane(state.runPane);
  if (els.send) els.send.disabled = false;
  pinBottom();
  els.draft?.focus();
}

function connectionLostMessage(err) {
  const text = String(err?.message || err);
  if (/network error|failed to fetch|networkerror|load failed/i.test(text)) {
    return "Connection to the office was lost. The turn may still have finished â€” reload (Ctrl+R) or reopen Crew to check.";
  }
  return text;
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
      label: headline || "@peer Â· chat",
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
  if ((ev.ctrlKey || ev.metaKey) && ev.code === "Backslash") {
    if (document.querySelector("dialog[open]")) return;
    ev.preventDefault();
    splitCurrent(ev.shiftKey ? "below" : "right");
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === "W" || ev.key === "w")) {
    if (state.split === "none") return;
    ev.preventDefault();
    closeSplit();
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
    const row = (state.bootstrap?.dms ?? []).find((d) => d.id === id);
    if (row?.archived) {
      items.push({
        id: "unarchive",
        label: "Unarchive",
        run: () =>
          persistDmPrefs((p) => ({
            archived: (p.archived || []).filter((x) => x !== id),
            deleted: p.deleted || [],
          })).catch((err) => addMessage({ who: "error", text: String(err), kind: "error" })),
      });
    } else {
      items.push({
        id: "archive",
        label: "Archive",
        run: () =>
          persistDmPrefs((p) => ({
            archived: (p.archived || []).includes(id) ? p.archived : [...(p.archived || []), id],
            deleted: (p.deleted || []).filter((x) => x !== id),
          })).catch((err) => addMessage({ who: "error", text: String(err), kind: "error" })),
      });
    }
    items.push({
      id: "delete-chat",
      label: "Delete",
      danger: true,
      run: () => {
        if (!confirm("Hide this chat from the list? The log stays on disk.")) return;
        persistDmPrefs((p) => ({
          archived: (p.archived || []).filter((x) => x !== id),
          deleted: (p.deleted || []).includes(id) ? p.deleted : [...(p.deleted || []), id],
        })).catch((err) => addMessage({ who: "error", text: String(err), kind: "error" }));
      },
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
  const btn = ev.target.closest("#channel-list [data-id]");
  if (!btn || !btn.dataset.id) return;
  showRailMenu(ev, "channel", btn.dataset.id);
});

els.people.addEventListener("contextmenu", (ev) => {
  const chat = ev.target.closest(".dm-row");
  if (chat?.dataset.id && els.people.contains(chat)) {
    showRailMenu(ev, "dm", chat.dataset.id);
    return;
  }
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
  if (menu && !menu.hidden && !menu.contains(ev.target)) closeMenu();
  if (!ev.target.closest(".attach-menu-wrap")) {
    document.querySelectorAll(".attach-menu").forEach((el) => {
      el.hidden = true;
    });
  }
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
      li.append(cmd, ` â€” ${c.hint}`);
      list.append(li);
    }
  }
  dlg?.showModal();
}

function openModeSheet() {
  if (els.modeBtn?.disabled) return;
  const current = currentPermissionMode();
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
  toast(`window ${keep} Â· posted ${posted} Â· compacted: ${compacted}`);
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
    fillImplPicker(document.getElementById("bot-model"), "", null, "workspace default");
    fillModelSelect(document.getElementById("bot-fallback"), "", "workspace fallback");
    syncBotFallback();
    fillModelSelect(document.getElementById("bot-title-model"), "", "Jobs Title default");
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
  document.getElementById("ch-mode").value =
    state.bootstrap?.defaultPermissionMode || "auto-accept";
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
document.getElementById("ch-file-pick").addEventListener("change", async (ev) => {
  const files = [...(ev.target.files ?? [])];
  for (const f of files) await addResolvedChPath(f.webkitRelativePath || f.name);
  ev.target.value = "";
});
document.getElementById("ch-folder-pick").addEventListener("change", async (ev) => {
  const files = [...(ev.target.files ?? [])];
  const roots = new Set();
  for (const f of files) {
    const rel = workspaceRelPath(f.webkitRelativePath || f.name, state.bootstrap?.cwd);
    const root = rel.split("/")[0];
    if (root) roots.add(root);
  }
  for (const r of roots) await addResolvedChPath(r);
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
        meta.textContent = `${row.tool}${row.botId ? ` Â· @${row.botId}` : ""}`;
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
    [".attach-plus", "plus"],
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
  r.querySelector(".room-brief")?.addEventListener("click", () => {
    activatePane(i);
    if (state.kind === "channel") openChannelSettings();
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
  const plus = r.querySelector(".attach-plus");
  const menu = r.querySelector(".attach-menu");
  plus?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    activatePane(i);
    const open = menu?.hidden !== false;
    document.querySelectorAll(".attach-menu").forEach((el) => {
      el.hidden = true;
    });
    if (menu) menu.hidden = !open ? true : false;
    if (open && menu) menu.hidden = false;
  });
  r.querySelector(".attach-file")?.addEventListener("click", () => {
    activatePane(i);
    if (menu) menu.hidden = true;
    filePick?.click();
  });
  r.querySelector(".attach-folder")?.addEventListener("click", () => {
    activatePane(i);
    if (menu) menu.hidden = true;
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
  if (right) {
    right.hidden = true;
    right.classList.remove("ready");
  }
  const chip = document.getElementById("drag-chip");
  if (chip) chip.hidden = true;
  document.querySelectorAll(".is-pulling").forEach((el) => el.classList.remove("is-pulling"));
}

function dropHow(ev) {
  const pane1 = document.getElementById("pane-1");
  if (pane1 && !pane1.hidden) {
    const r1 = pane1.getBoundingClientRect();
    if (ev.clientX >= r1.left - 8) return "right";
  }
  const host = document.getElementById("panes");
  if (!host) return "replace";
  const rect = host.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / Math.max(1, rect.width);
  const y = (ev.clientY - rect.top) / Math.max(1, rect.height);
  if (x > 0.45) return "right";
  if (y > 0.55) return "below";
  return "replace";
}

function pullLabel(payload) {
  if (!payload) return "Chat";
  if (payload.kind === "dm") {
    const row = (state.bootstrap?.dms ?? []).find((d) => d.id === payload.id);
    return row?.title || dmHeadline(payload.id);
  }
  if (payload.kind === "channel") {
    const ch = (state.bootstrap?.channels ?? []).find((c) => c.id === payload.id);
    return `#${ch?.title || payload.id}`;
  }
  if (payload.kind === "person") return displayName(payload.id);
  return payload.id;
}

function moveDragChip(label, x, y) {
  const chip = document.getElementById("drag-chip");
  if (!chip) return;
  chip.hidden = false;
  chip.textContent = label;
  chip.style.left = `${x + 14}px`;
  chip.style.top = `${y + 12}px`;
}

function dropTargetReady(ev) {
  const zone = document.getElementById("drop-right");
  if (zone && !zone.hidden) {
    const r = zone.getBoundingClientRect();
    if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
      return true;
    }
  }
  const host = document.getElementById("panes");
  const rect = host?.getBoundingClientRect();
  if (!rect) return false;
  return ev.clientX >= rect.left + rect.width * 0.42 && ev.clientX <= rect.right;
}

function showDropGhosts(how) {
  const right = document.getElementById("drop-right");
  if (right) right.hidden = how !== "right";
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

let railDrag = null;
let railPull = null;
let railPullMoved = false;

function pullFromTarget(el) {
  const chat = el.closest?.(".dm-row");
  if (chat?.dataset.id) return { kind: "dm", id: chat.dataset.id };
  if (el.closest?.(".add, .edit, .del, input, textarea, button.add, button.edit")) return null;
  const person = el.closest?.(".person");
  if (person?.dataset.id) return { kind: "person", id: person.dataset.id };
  const ch = el.closest?.("#channel-list [data-id]");
  if (ch?.dataset.id) return { kind: "channel", id: ch.dataset.id };
  return null;
}

function wireRailPull() {
  const onDown = (ev) => {
    if (ev.button !== 0) return;
    const payload = pullFromTarget(ev.target);
    if (!payload) return;
    railPullMoved = false;
    railPull = { ...payload, x: ev.clientX, y: ev.clientY, el: ev.target };
  };
  const cancelNativeDrag = (ev) => {
    if (pullFromTarget(ev.target)) ev.preventDefault();
  };
  els.channels?.addEventListener("dragstart", cancelNativeDrag, true);
  els.people?.addEventListener("dragstart", cancelNativeDrag, true);
  els.direct?.addEventListener("dragstart", cancelNativeDrag, true);
  window.addEventListener("pointermove", (ev) => {
    if (!railPull) return;
    const dx = ev.clientX - railPull.x;
    const dy = ev.clientY - railPull.y;
    if (!railPullMoved && Math.hypot(dx, dy) < 10) return;
    railPullMoved = true;
    ev.preventDefault();
    document.body.classList.add("rail-pulling");
    const src = pullFromTarget(railPull.el) ? railPull.el.closest(".dm-row, .person, #channel-list [data-id]") : null;
    src?.classList.add("is-pulling");
    showDropGhosts("right");
    const zone = document.getElementById("drop-right");
    zone?.classList.toggle("ready", dropTargetReady(ev));
    moveDragChip(pullLabel(railPull), ev.clientX, ev.clientY);
  });
  window.addEventListener("pointerup", (ev) => {
    if (!railPull) return;
    const pull = railPull;
    railPull = null;
    document.body.classList.remove("rail-pulling");
    hideDropGhosts();
    if (!railPullMoved) return;
    if (!dropTargetReady(ev)) return;
    splitOpen(pull.kind, pull.id, "right");
    setTimeout(() => {
      railPullMoved = false;
    }, 0);
  });
  els.channels?.addEventListener("pointerdown", onDown);
  els.people?.addEventListener("pointerdown", onDown);
  els.direct?.addEventListener("pointerdown", onDown);
}

function onRailDragStart(ev, kind, id) {
  const next = resolvePaneTarget(kind, id);
  railDrag = `${next.kind}:${next.id}`;
  try {
    ev.dataTransfer.setData("text/plain", railDrag);
    ev.dataTransfer.setData(THREAD_MIME, railDrag);
    ev.dataTransfer.effectAllowed = "copy";
  } catch {
    /* WebView2 */
  }
}

function wireDrag() {
  els.channels?.addEventListener("dragstart", (ev) => {
    const btn = ev.target.closest("#channel-list [data-id]");
    if (!btn?.dataset.id) return;
    onRailDragStart(ev, "channel", btn.dataset.id);
  });
  els.people?.addEventListener("dragstart", (ev) => {
    const chat = ev.target.closest(".dm-row");
    if (chat?.dataset.id) {
      onRailDragStart(ev, "dm", chat.dataset.id);
      return;
    }
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
  const allow = (ev) => {
    if (!railDrag && !railPullMoved) return false;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    showDropGhosts(dropHow(ev));
    return true;
  };
  host.addEventListener("dragover", allow);
  host.addEventListener("dragleave", (ev) => {
    if (!host.contains(ev.relatedTarget)) hideDropGhosts();
  });
  host.addEventListener("drop", (ev) => {
    ev.preventDefault();
    hideDropGhosts();
    const raw =
      railDrag ||
      ev.dataTransfer.getData(THREAD_MIME) ||
      ev.dataTransfer.getData("text/plain");
    railDrag = null;
    const parsed = parseThreadPayload(raw);
    if (!parsed?.id) return;
    splitOpen(parsed.kind, parsed.id, dropHow(ev));
  });
  document.addEventListener("dragend", () => {
    railDrag = null;
    hideDropGhosts();
  });
}

function wireSplitHandle() {
  const handle = document.getElementById("split-handle");
  const host = document.getElementById("panes");
  if (!handle || !host) return;
  let dragging = false;
  const min = 220;
  const applyX = (clientX) => {
    const rect = host.getBoundingClientRect();
    let left = clientX - rect.left;
    const max = rect.width - min - 8;
    if (state.split === "none") {
      if (left > rect.width - 40) return;
      state.split = "right";
      state.deskOpen = false;
      applySplitClass("right");
      setPaneVacant(true);
      saveSplit();
    }
    if (state.split !== "right") return;
    if (left > max + min / 2) {
      dragging = false;
      handle.classList.remove("dragging");
      closeSplit();
      return;
    }
    left = Math.max(min, Math.min(max, left));
    host.style.gridTemplateColumns = `${left}px 8px minmax(${min}px, 1fr)`;
  };
  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    handle.classList.add("dragging");
    try {
      handle.setPointerCapture(ev.pointerId);
    } catch {
      /* visual tests */
    }
    ev.preventDefault();
  });
  const onMove = (ev) => {
    if (!dragging) return;
    applyX(ev.clientX);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
  };
  handle.addEventListener("pointermove", onMove);
  window.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  window.addEventListener("pointerup", onUp);
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
document.getElementById("always-add")?.addEventListener("click", async () => {
  const tool = document.getElementById("always-tool")?.value || "apply_patch";
  const raw = document.getElementById("always-key")?.value?.trim() || "";
  if (!raw) return;
  const body = tool === "shell" ? { tool, command: raw } : { tool, path: raw };
  try {
    await api("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    document.getElementById("always-key").value = "";
    await renderAlways();
  } catch (err) {
    toast(String(err));
  }
});
document.getElementById("app-default-mode")?.addEventListener("change", async (ev) => {
  const res = await (
    await api("/api/default-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: ev.target.value }),
    })
  ).json();
  state.bootstrap.defaultPermissionMode = res.defaultPermissionMode;
});
document.getElementById("app-auto-compact")?.addEventListener("change", async (ev) => {
  const res = await (
    await api("/api/auto-compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: ev.target.checked }),
    })
  ).json();
  state.bootstrap.autoCompact = res.autoCompact;
});
document.getElementById("app-base-url")?.addEventListener("change", async (ev) => {
  const res = await (
    await api("/api/base-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: ev.target.value }),
    })
  ).json();
  state.bootstrap.baseUrl = res.baseUrl;
});
document.getElementById("app-reviewer-model")?.addEventListener("change", async (ev) => {
  const res = await (
    await api("/api/reviewer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ev.target.value }),
    })
  ).json();
  state.bootstrap.reviewerModel = res.reviewerModel;
});
document.getElementById("app-update-url")?.addEventListener("change", async (ev) => {
  const res = await (
    await api("/api/update-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updateUrl: ev.target.value }),
    })
  ).json();
  if (res.error) {
    toast(String(res.error));
    return;
  }
  state.bootstrap.updateUrl = res.updateUrl || "";
});
document.getElementById("app-update-auto")?.addEventListener("change", async (ev) => {
  const on = Boolean(ev.target.checked);
  const res = await (
    await api("/api/update-auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoUpdate: on }),
    })
  ).json();
  if (res.error) {
    toast(String(res.error));
    return;
  }
  state.bootstrap.autoUpdate = res.autoUpdate;
});

async function installCrewUpdate(row) {
  const btn = document.getElementById("app-update-install");
  const meta = document.getElementById("app-update-meta");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Downloadingâ€¦";
  }
  try {
    if (window.__CREW_DESKTOP__ && window.__TAURI__?.updater) {
      if (meta) meta.textContent = "Downloading (signed updater)â€¦";
      const rel = await window.__TAURI__.updater.check();
      if (rel && rel.available) {
        await rel.downloadAndInstall();
        if (meta) meta.textContent = "Installed. Relaunchingâ€¦";
        await window.__TAURI__.process.relaunch();
        return;
      }
      if (meta) meta.textContent = "No update via the signed feed.";
      return;
    }
    if (meta) meta.textContent = "Downloading installerâ€¦";
    const res = await (
      await api("/api/update-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: row.url }),
      })
    ).json();
    if (res.error) {
      if (meta) meta.textContent = String(res.error);
      return;
    }
    if (meta) meta.textContent = "Installer launched â€” finish it and reopen Crew.";
    toast("Installer launched.");
  } catch (err) {
    if (meta) meta.textContent = String(err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Install update";
    }
  }
}

document.getElementById("app-update-check")?.addEventListener("click", async () => {
  const meta = document.getElementById("app-update-meta");
  const open = document.getElementById("app-update-open");
  const install = document.getElementById("app-update-install");
  if (meta) meta.textContent = "Checkingâ€¦";
  if (open) open.hidden = true;
  if (install) install.hidden = true;
  try {
    const res = await (await api("/api/update-check", { method: "POST" })).json();
    if (res.status === "disabled") {
      if (meta) meta.textContent = "Update check is off.";
      return;
    }
    if (res.status === "current") {
      if (meta) meta.textContent = `Up to date (${res.version}).`;
      return;
    }
    if (res.status === "available") {
      if (meta) meta.textContent = [res.version, "available", res.notes].filter(Boolean).join(" Â· ");
      state.updateAvailable = res;
      if (install) {
        install.hidden = false;
        install.textContent = `Install ${res.version}`;
      }
      if (open && res.url) {
        open.href = res.url;
        open.hidden = false;
      }
      return;
    }
    if (meta) meta.textContent = res.error || "Update check failed.";
  } catch (err) {
    if (meta) meta.textContent = String(err);
  }
});
document.getElementById("app-update-install")?.addEventListener("click", () => {
  const row = state.updateAvailable;
  if (row?.url || window.__CREW_DESKTOP__) installCrewUpdate(row || {});
});

async function checkForUpdateQuietly() {
  try {
    const last = Number(localStorage.getItem("crew.updateAt") || 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    localStorage.setItem("crew.updateAt", String(Date.now()));
    const res = await (await api("/api/update-check", { method: "POST" })).json();
    if (res?.status === "available") {
      state.updateAvailable = res;
      toast(`Crew ${res.version} is available â€” Settings â†’ About â†’ Install.`);
      const install = document.getElementById("app-update-install");
      if (install) {
        install.hidden = false;
        install.textContent = `Install ${res.version}`;
      }
    }
  } catch {
    /* silent */
  }
}
document.querySelector("[data-settings-panel='providers']")?.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || !ev.target.matches("[data-prov-custom]")) return;
  ev.preventDefault();
  ev.target.closest("[data-harness]")?.querySelector("[data-prov-custom-add]")?.click();
});
document.querySelector("[data-settings-panel='providers']")?.addEventListener("change", (ev) => {
  if (!ev.target.closest("[data-harness]")) return;
  if (ev.target.matches("[data-prov-custom]")) return;
  const card = ev.target.closest("[data-harness]");
  if (ev.target.matches("[data-prov-on]") && ev.target.checked) card.classList.add("open");
  persistProviders().catch((err) => toast(String(err)));
});
document.querySelector("[data-settings-panel='providers']")?.addEventListener("click", (ev) => {
  const card = ev.target.closest("[data-harness]");
  if (ev.target.closest("[data-prov-custom-add]")) {
    if (!card) return;
    const input = card.querySelector("[data-prov-custom]");
    const box = card.querySelector("[data-prov-customs]");
    const id = input?.value?.trim();
    if (!id || !box) return;
    if (![...box.querySelectorAll("[data-custom-chip]")].some((el) => el.dataset.id === id)) {
      box.append(customModelChip(id));
    }
    input.value = "";
    persistProviders().catch((err) => toast(String(err)));
    return;
  }
  if (ev.target.closest("[data-custom-chip]")) {
    ev.target.closest("[data-custom-chip]").remove();
    persistProviders().catch((err) => toast(String(err)));
    return;
  }
  const head = ev.target.closest(".provider-head");
  if (!card || !head) return;
  if (ev.target.closest("input, label, button")) return;
  card.classList.toggle("open");
});
document.getElementById("prov-recheck")?.addEventListener("click", () => {
  refreshProviderHealth();
});
document.getElementById("bot-model")?.addEventListener("change", () => syncBotFallback());

decorateChrome();
wirePane(0);
wirePane(1);
wireDrag();
wireRailPull();
wireSplitHandle();
boot().catch((err) => {
  addMessage({ who: "error", text: String(err), kind: "error" });
});

document.querySelectorAll(".draft").forEach((el) => {
  el.addEventListener("input", () => {
    if (state.running) syncRunButton();
  });
});
