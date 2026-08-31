const CDP = 9223;
let list = null;
for (let i = 0; i < 20; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
    if (list.length) break;
  } catch {}
  await Bun.sleep(500);
}
const page = list?.find((x) => x.type === "page" && x.url.includes("7734"));
if (!page) {
  console.log("no office page target");
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => {
  ws.onopen = r;
  setTimeout(r, 8000);
});
console.log("ws open");
let mid = 0;
const pend = new Map();
const send = (m, pr, timeout = 4000) =>
  new Promise((res) => {
    const i = ++mid;
    const to = setTimeout(() => {
      console.log("CDP SLOW:", m);
      pend.delete(i);
      res(undefined);
    }, timeout);
    pend.set(i, (v) => {
      clearTimeout(to);
      res(v);
    });
    try {
      ws.send(JSON.stringify({ id: i, method: m, params: pr }));
    } catch (e) {
      clearTimeout(to);
      res(undefined);
    }
  });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pend.has(msg.id)) {
    pend.get(msg.id)(msg.result);
    pend.delete(msg.id);
  }
};
const q = async (label, expr, tries = 12) => {
  for (let i = 0; i < tries; i++) {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (!r || !r.result) {
      await Bun.sleep(700);
      continue;
    }
    if (r.exceptionDetails) {
      console.log(label, "PAGE ERR:", (r.exceptionDetails.exception?.description || "").slice(0, 200));
      return null;
    }
    const v = r.result.value;
    console.log(label, "→", JSON.stringify(v).slice(0, 280));
    return v;
  }
  console.log(label, "GAVE UP");
  return null;
};

await q("readyState", "document.readyState");
await q("engine", "typeof window.__floorGame");
await q(
  "app.js served has fixes",
  `fetch("/app.js").then((r) => r.text()).then((t) => ({ hasSay: t.includes("floorGame?.say"), len: t.length }))`,
  4,
);
await q(
  "floor-game served has fixes",
  `fetch("/floor-game.js").then((r) => r.text()).then((t) => ({ hasClamp: t.includes("Math.max(0, Math.min(1"), hasFit: t.includes("fitFloor"), len: t.length }))`,
  4,
);
await q("frames t0", `window.__fc0 = window.__floorGame.debugState().frames || 0; "ok"`);
await Bun.sleep(2000);
await q("frames delta 2s", `JSON.stringify({ d: (window.__floorGame.debugState().frames || 0) - window.__fc0 })`);
await q("visibility", `document.visibilityState`);
ws.close();
process.exit(0);
