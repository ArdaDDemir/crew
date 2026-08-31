import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = process.argv[2] || "7734";
mkdirSync("C:/Users/Arda/AppData/Local/Temp/opencode/audit", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERR: " + String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    errors.push(`[console.${m.type()}] ` + m.text().slice(0, 200));
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForFunction(() => !!window.__floorGame, null, { timeout: 20000 }).catch(() => {});
await Bun.sleep(3000);

// full page
await page.screenshot({ path: "C:/Users/Arda/AppData/Local/Temp/opencode/audit-full.png" });

// floor pane only (clip)
const frect = await page
  .evaluate(`(() => { const f = document.getElementById("floor"); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`)
  .catch(() => null);
if (frect && frect.w > 0) {
  await page.locator("#floor").screenshot({ path: "C:/Users/Arda/AppData/Local/Temp/opencode/audit-floor.png" });
  console.log("floor rect:", JSON.stringify(frect));
} else {
  console.log("NO #floor element");
}

// A-Z structural audit
const audit = await page.evaluate(`(() => {
  const out = {};
  out.engine = typeof window.__floorGame;
  const c = document.getElementById("floor-canvas");
  out.canvas = c ? { w: c.clientWidth, h: c.clientHeight, dprW: c.width } : null;
  const f = document.getElementById("floor");
  out.floorBox = f ? { w: f.clientWidth, h: f.clientHeight } : null;
  out.hint = document.getElementById("floor-hint")?.textContent || null;
  out.plaque = document.getElementById("floor-plaque")?.textContent || null;
  out.deskLabel = document.getElementById("desk-label")?.textContent || null;
  out.channelCount = document.querySelectorAll("#channel-list [role='button']").length;
  out.peopleCount = document.querySelectorAll("#people .person-row, #people [role='button']").length;
  out.kitHidden = document.getElementById("floor-kit")?.hidden ?? null;
  out.lookVisible = !!document.getElementById("floor-look")?.offsetParent;
  out.members = (window.__floorGame?.debugState?.()?.members || []).map((m) => m.id + "@" + Math.round(m.at.x) + "," + Math.round(m.at.at ? 0 : m.at.y));
  out.you = window.__floorGame?.debugState?.()?.you?.at;
  out.doors = (window.__floorGame?.debugState?.()?.doors || []).length;
  out.furniture = (window.__floorGame?.debugState?.()?.furniture || []).length;
  out.frames = window.__floorGame?.debugState?.()?.frames || 0;
  return out;
})()`);
console.log("AUDIT:", JSON.stringify(audit, null, 1));
console.log("ERRORS:", errors.length ? errors.slice(0, 6) : "none");

await browser.close();
process.exit(0);
