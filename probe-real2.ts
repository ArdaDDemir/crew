import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const contexts = browser.contexts();
const page = contexts[0]?.pages().find((p) => p.url().includes("7734"));
if (!page) {
  console.log("no office page");
  process.exit(1);
}
console.log("page:", page.url());
let lastStep = "start";
setTimeout(() => {
  console.log("WATCHDOG lastStep:", lastStep);
  process.exit(3);
}, 60000);
page.on("pageerror", (e) => console.log("PAGEERR:", String(e).slice(0, 160)));

const q = async (label, expr) => {
  lastStep = label;
  const v = await page.evaluate(expr);
  console.log(label, "→", JSON.stringify(v).slice(0, 260));
  return v;
};

await q("readyState", `document.readyState`);
await q("engine", `typeof window.__floorGame`);
await q("app.js served has fixes", `fetch("/app.js").then((r) => r.text()).then((t) => ({ hasSay: t.includes("floorGame?.say"), len: t.length }))`);
await q("floor-game served has fixes", `fetch("/floor-game.js").then((r) => r.text()).then((t) => ({ hasClamp: t.includes("Math.max(0, Math.min(1"), hasFit: t.includes("fitFloor"), len: t.length }))`);

lastStep = "frames";
const fr0 = await page.evaluate(`window.__floorGame.debugState().frames || 0`);
await Bun.sleep(2000);
const fr1 = await page.evaluate(`window.__floorGame.debugState().frames || 0`);
console.log("frames/sec:", fr1 - fr0);
check2("rAF loop running", fr1 - fr0 > 3);

function check2(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
}

// real mouse walk through Playwright (Input pipeline, robust)
lastStep = "walk";
const before = await page.evaluate(`JSON.stringify(window.__floorGame.debugState().you.at)`);
const cs = await page.evaluate(`(() => { const s = window.__floorGame.debugWorldToScreen(2.5, 7.5); const r = document.getElementById("floor-canvas").getBoundingClientRect(); return { x: Math.round(s.x + r.x), y: Math.round(s.y + r.y) }; })()`);
await page.mouse.click(cs.x, cs.y);
await Bun.sleep(2500);
const after = await page.evaluate(`JSON.stringify(window.__floorGame.debugState().you.at)`);
check2("walk: carpet click", before !== after, `${before} → ${after}`);

lastStep = "screenshot";
await page.screenshot({ path: "C:/Users/Arda/AppData/Local/Temp/opencode/floor-real-app.png" });
console.log("screenshot saved");

await browser.close();
process.exit(0);
