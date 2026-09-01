import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.argv[2] || "7901";
const assets = "C:/Users/Arda/Desktop/Projects/aibuildingapp/docs/assets";
const cwd = mkdtempSync(join(tmpdir(), "crew-shots-"));
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
await post("/api/bots", { id: "lead", name: "Lead", icon: "🧭" });
await post("/api/bots", { id: "coder", name: "Coder", icon: "💻" });
await post("/api/bots", { id: "designer", name: "Designer", icon: "🎨" });
await post("/api/bots", { id: "tester", name: "Tester", icon: "🧪" });
await post("/api/channels", {
  id: "landing",
  title: "Landing",
  memberBotIds: ["lead", "coder", "designer", "tester"],
  leadBotId: "lead",
  context: "Ship the marketing landing. Keep copy short.",
});
await post("/api/looks", { botId: "lead", skin: "light", hair: "short", top: "hoodie" });
await post("/api/looks", { botId: "coder", skin: "dark", hair: "buzz", top: "sweater" });
await post("/api/looks", { botId: "designer", skin: "mid", hair: "ponytail", top: "polo" });
await post("/api/looks", { botId: "tester", skin: "mid", hair: "curly", top: "tee" });
await post("/api/floor", {
  id: "landing",
  furniture: [
    { id: "f1", kind: "plant", x: 16, y: 40 },
    { id: "f2", kind: "shelf", x: 24, y: 24 },
    { id: "f3", kind: "rug", x: 72, y: 64 },
    { id: "f4", kind: "lamp", x: 120, y: 56 },
  ],
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__floorGame, null, { timeout: 20000 });
await page.evaluate(`window.__pump = setInterval(() => window.__floorGame.debugTick(performance.now()), 16);`);
await Bun.sleep(1500);
// liveliness: a bot is typing + one just posted
await page.evaluate(`window.__floorGame.say("coder", "Landing is live — hero copy and pricing table shipped.");`);
await Bun.sleep(900);

// full office
await page.screenshot({ path: join(assets, "office.png") });

// floor close-up
await page.locator("#floor").screenshot({ path: join(assets, "floor.png") });

console.log("screenshots saved to docs/assets/");
await browser.close();
proc.kill();
process.exit(0);
