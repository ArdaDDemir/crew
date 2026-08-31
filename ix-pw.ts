import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.argv[2] || "7816";
const cwd = mkdtempSync(join(tmpdir(), "crew-pw-"));
mkdirSync(join(cwd, ".crew"), { recursive: true });
writeFileSync(join(cwd, ".crew", "config.json"), JSON.stringify({ apiKey: "sk-test", autoUpdate: false }));

const proc = Bun.spawn(
  ["bun", "C:/Users/Arda/Desktop/Projects/aibuildingapp/apps/web/src/server.ts", "--port", port, "--cwd", cwd],
  { stdout: "ignore", stderr: "ignore", cwd: "C:/Users/Arda/Desktop/Projects/aibuildingapp" },
);
const t0 = Date.now();
while (Date.now() - t0 < 15000) {
  try {
    if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
  } catch {}
  await Bun.sleep(150);
}
const post = (path, body) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
await post("/api/bots", { id: "lead", name: "Lead" });
await post("/api/bots", { id: "coder", name: "Coder" });
await post("/api/channels", { id: "landing", title: "Landing", memberBotIds: ["lead", "coder"], leadBotId: "lead" });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__floorGame, null, { timeout: 15000 });

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? "PASS" : "FAIL"} â€” ${name}${detail ? " Â· " + detail : ""}`);
const sleep = (ms) => Bun.sleep(ms);
const st0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__floorGame.debugState())));
check("boot members", st0.members.length === 2, st0.members.map((m) => m.id).join(","));
check("boot you at home", st0.you.at.x === 5 && st0.you.at.y === 3, JSON.stringify(st0.you.at));

const w2s = (wx, wy) =>
  page.evaluate(
    `(() => { const s = window.__floorGame.debugWorldToScreen(${wx}, ${wy}); const r = document.getElementById("floor-canvas").getBoundingClientRect(); return { x: s.x + r.x, y: s.y + r.y }; })()`,
  );

// 1) person click â†’ DM
const coder = st0.members.find((m) => m.id === "coder");
const ps = await w2s(coder.at.x, coder.at.y);
await page.mouse.click(ps.x, ps.y - 22);
await sleep(1500);
const title = await page.evaluate(`document.querySelector(".pane[data-pane='0'] .room-title")?.textContent || ""`);
check("person click opens DM", String(title).toLowerCase().includes("coder"), `title=${JSON.stringify(title)}`);

// back to channel
await page.evaluate(`(() => { document.querySelector("#channel-list [role='button']")?.click(); return 1; })()`);
await sleep(1400);

// 2) carpet click walks You
const before = await page.evaluate(`JSON.stringify(window.__floorGame.debugState().you.at)`);
const cs = await w2s(2.5, 7.5);
await page.mouse.click(cs.x, cs.y);
await sleep(2800);
const after = await page.evaluate(`JSON.stringify(window.__floorGame.debugState().you.at)`);
check("carpet click walks You", before !== after, `${before} â†’ ${after}`);

// 3) kit + click places plant
await page.evaluate(`(() => { document.querySelector('#floor-kit [data-kind="plant"]')?.click(); return 1; })()`);
const f0 = (await page.evaluate(`window.__floorGame.debugState().furniture.length`));
const spot = await w2s(3.5, 7.5);
await page.mouse.click(spot.x, spot.y);
await sleep(1200);
const f1 = await page.evaluate(`window.__floorGame.debugState().furniture.length`);
check("kit + click places plant", f1 === f0 + 1, `${f0} â†’ ${f1}`);

// 4) furniture click removes (owner)
await page.evaluate(`(() => { document.querySelector('#floor-kit [data-kind="sofa"]')?.click(); return 1; })()`);
const s2 = await w2s(7.5, 6.5);
await page.mouse.click(s2.x, s2.y);
await sleep(1200);
const f2 = await page.evaluate(`window.__floorGame.debugState().furniture.length`);
check("kit + click places sofa", f2 === f1 + 1, `${f1} â†’ ${f2}`);

// 5) speech bubble on say
await page.evaluate(`window.__floorGame.say("coder", "Merhaba ekip, landing'i bitirdim.");`);
await sleep(300);
const bubbleText = await page.evaluate(`(() => {
  const g = window.__floorGame;
  return g && g.debugBubble ? g.debugBubble("coder") : "no-probe";
})()`);
check("speech bubble shows account", String(bubbleText).includes("landing"), String(bubbleText).slice(0, 60));

await page.screenshot({ path: "C:/Users/Arda/AppData/Local/Temp/opencode/floor-pw.png" });
console.log("RESULTS:");
for (const r of results) console.log(" ", r);

await browser.close();
proc.kill();
process.exit(0);
