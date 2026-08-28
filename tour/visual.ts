/**
 * Visual + behavior pass against the live office (http://127.0.0.1:7734).
 * Chrome headless via CDP. Not a unit test — run: bun run tour/visual.ts
 */
const CHROME =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ORIGIN = "http://127.0.0.1:7734";
const PORT = 9333;

type CdpMsg = { id?: number; method?: string; result?: unknown; error?: { message: string } };

const fails: string[] = [];
const oks: string[] = [];
function ok(msg: string) {
  oks.push(msg);
  console.log("ok  " + msg);
}
function fail(msg: string) {
  fails.push(msg);
  console.log("FAIL " + msg);
}

async function waitPort(port: number, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await Bun.sleep(200);
  }
  throw new Error("chrome debug port did not open");
}

async function main() {
  const health = await (await fetch(`${ORIGIN}/api/health`)).json();
  if (!health.ok) fail("health not ok");
  else ok("GET /api/health");

  const html = await (await fetch(`${ORIGIN}/`)).text();
  for (const id of [
    "jump",
    "ctx-menu",
    "pane-0",
    "pane-1",
    "app-top",
    "split-handle",
    "desk-toggle",
    "work-chip",
    "context-chip",
    "jobs-section",
    "mcp-section",
    "slash-help",
    "desk",
  ]) {
    if (html.includes(`id="${id}"`)) ok(`html #${id}`);
    else fail(`html missing #${id}`);
  }

  const userData = await Bun.file("tour/.chrome-profile").exists()
    ? "tour/.chrome-profile"
    : "tour/.chrome-profile";
  await Bun.write("tour/.chrome-profile/.keep", "1");

  const chrome = Bun.spawn(
    [
      CHROME,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${process.cwd()}\\tour\\.chrome-profile`,
      "--window-size=1440,900",
      ORIGIN,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );

  try {
    await waitPort(PORT);
    const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
      url: string;
    }[];
    const page = targets.find((t) => t.type === "page" && t.url.startsWith(ORIGIN)) ?? targets.find((t) => t.type === "page");
    if (!page) throw new Error("no chrome page target");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", () => res(null));
      ws.addEventListener("error", () => rej(new Error("cdp ws")));
    });

    let nextId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as CdpMsg;
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    });
    const send = (method: string, params?: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Page.navigate", { url: ORIGIN });
    await send("Page.loadEventFired").catch(() => null);
    await Bun.sleep(800);

    const evalJs = async (expression: string) => {
      const result = (await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result?: { value?: unknown; description?: string }; exceptionDetails?: { text: string } };
      if (result.exceptionDetails) {
        const extra = JSON.stringify(result.exceptionDetails).slice(0, 400);
        throw new Error((result.exceptionDetails.text || "eval") + " " + extra);
      }
      return result.result?.value;
    };

    const title = await evalJs("document.title");
    if (title === "Crew") ok("title Crew");
    else fail(`title ${title}`);

    const logo = await evalJs("Boolean(document.querySelector('.rail .logo'))");
    if (!logo) ok("rail has no second Crew wordmark");
    else fail("rail still has .logo");

    const topBrand = await evalJs("document.querySelector('#app-top .app-brand')?.textContent");
    if (topBrand === "Crew") ok("custom top bar");
    else fail(`app-top brand ${topBrand}`);
    const sendBg = await evalJs(`getComputedStyle(document.querySelector(".composer .send")).backgroundColor`);
    if (String(sendBg).includes("47, 138, 91") || String(sendBg).includes("47,138,91")) ok("Send is green");
    else fail(`Send background ${sendBg}`);
    const splitHandle = await evalJs(`Boolean(document.getElementById("split-handle"))`);
    if (splitHandle) ok("split handle on left chat");
    else fail("split handle missing");
    const desk = await evalJs(`Boolean(document.getElementById("desk") && document.getElementById("here-list"))`);
    if (desk) ok("members desk");
    else fail("members desk missing");
    const person = await evalJs(`document.querySelector(".person[data-id]")?.dataset.id || ""`);
    if (person) {
      await evalJs(`document.querySelector(".person[data-id]")?.click()`);
      await Bun.sleep(200);
      const expanded = await evalJs(`Boolean(document.querySelector(".person-block.open"))`);
      const chatN = await evalJs(`document.querySelectorAll(".person-block.open .dm-row").length`);
      if (expanded) ok("person expands chats");
      else fail("person click did not expand");
      if (typeof chatN === "number") ok(`person chat rows ${chatN}`);
      const directHuman = await evalJs(
        `Boolean(document.querySelector("#direct .dm-row") && !document.getElementById("direct")?.hidden)`,
      );
      if (!directHuman) ok("Direct hidden or bot-bot only");
      else ok("Direct still listed (bot-bot)");
    } else fail("no person row");

    await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))`);
    await Bun.sleep(200);
    const jumpHidden = await evalJs("document.getElementById('jump')?.hidden");
    if (jumpHidden === false) ok("Ctrl+K opens jump");
    else fail(`jump hidden=${jumpHidden}`);

    await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await Bun.sleep(150);
    const jumpClosed = await evalJs("document.getElementById('jump')?.hidden");
    if (jumpClosed === true) ok("Escape closes jump");
    else fail(`jump after Esc hidden=${jumpClosed}`);

    const shot1 = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
    await Bun.write("tour/gh-desktop.png", Buffer.from(shot1.data, "base64"));
    ok("desktop screenshot");

    const ch = await evalJs(`document.querySelector("#channel-list [data-id]")`);
    if (ch) {
      await evalJs(`
        const b = document.querySelector("#channel-list [data-id]");
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: r.left+20, clientY: r.top+8, button: 2 }));
      `);
      await Bun.sleep(150);
      const menuHidden = await evalJs("document.getElementById('ctx-menu')?.hidden");
      const labels = await evalJs(`[...document.querySelectorAll("#ctx-menu button")].map(b => b.textContent)`);
      if (menuHidden === false) ok("right-click channel menu");
      else fail("context menu stayed hidden");
      const arr = Array.isArray(labels) ? labels : [];
      for (const need of ["Open", "Open to the right", "Open below", "Copy id"]) {
        if (arr.includes(need)) ok(`menu: ${need}`);
        else fail(`menu missing ${need} (${arr.join(",")})`);
      }
      await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    } else fail("no channel button");

    await evalJs(`
      const splitHost = document.getElementById("panes");
      const splitBar = document.getElementById("split-handle");
      const box = splitHost.getBoundingClientRect();
      const yy = box.top + Math.min(80, box.height / 2);
      splitBar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.right - 3, clientY: yy, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: box.left + box.width * 0.48, clientY: yy, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: box.left + box.width * 0.48, clientY: yy, pointerId: 1 }));
    `);
    await Bun.sleep(400);
    const splitOn = await evalJs(`document.getElementById("panes")?.classList.contains("split-right")`);
    const pane1On = await evalJs(`document.getElementById("pane-1")?.hidden === false`);
    const deskOff = await evalJs(`document.querySelector(".stage")?.classList.contains("desk-off")`);
    if (splitOn && pane1On) ok("Split right opens pane-1");
    else fail(`split right class=${splitOn} pane-1 hidden=${await evalJs("document.getElementById('pane-1')?.hidden")}`);
    if (deskOff) ok("split right hides members for width");
    else fail("members still open after split right");
    const emptyCopy = await evalJs(`document.getElementById("pane-1-empty")?.innerText || ""`);
    if (String(emptyCopy).includes("Drop a chat here")) ok("empty pane drop copy");
    else fail(`empty pane copy ${String(emptyCopy).slice(0, 80)}`);
    const shotSplit = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
    await Bun.write("tour/gh-split.png", Buffer.from(shotSplit.data, "base64"));
    ok("split screenshot");
    await evalJs(`document.querySelector(".pane-close")?.click()`);
    await Bun.sleep(200);
    const splitOff = await evalJs(`document.getElementById("panes")?.classList.contains("split-none")`);
    if (splitOff) ok("Close pane restores single");
    else fail("close pane did not restore split-none");

    await evalJs(`document.getElementById("app-settings")?.click()`);
    await Bun.sleep(250);
    const jobsOpen = await evalJs(`document.getElementById("app-modal")?.open === true`);
    const tabs = await evalJs(`[...document.querySelectorAll("[data-settings-tab]")].map(b => b.dataset.settingsTab)`);
    if (jobsOpen) ok("Settings sheet open");
    else fail("Settings did not open");
    const picker = await evalJs(`Boolean(document.querySelector(".model-picker"))`);
    const pickerSearch = await evalJs(`Boolean(document.querySelector(".model-picker-q"))`);
    if (picker && pickerSearch) ok("grouped model picker");
    else fail("model picker missing search");
    await Bun.sleep(800);
    await evalJs(`document.querySelector(".model-picker-btn")?.click()`);
    await Bun.sleep(400);
    const allCat = await evalJs(`[...document.querySelectorAll(".model-picker-cat")].some(b => (b.textContent||"").includes("All"))`);
    if (allCat) ok("picker left All category");
    else fail("picker missing All category rail");
    const cats = await evalJs(`[...document.querySelectorAll(".model-picker-cat")].map(b => (b.textContent||"").trim())`);
    const catStr = Array.isArray(cats) ? cats.join(" ") : String(cats);
    if (catStr.includes("OpenRouter") || catStr.includes("Grok") || catStr.includes("OpenCode")) ok(`picker providers ${catStr}`);
    else fail(`picker missing provider cats: ${catStr}`);
    await evalJs(`document.body.click()`);
    const tabList = Array.isArray(tabs) ? tabs.join(" ") : String(tabs);
    for (const t of ["general", "providers", "jobs", "mcp", "permissions", "about"]) {
      if (tabList.includes(t)) ok(`settings tab ${t}`);
      else fail(`missing settings tab ${t}`);
    }
    if (!tabList.includes("models")) ok("Models tab replaced by Providers");
    else fail("Models tab still present");
    await evalJs(`document.querySelector('[data-settings-tab="providers"]')?.click()`);
    await Bun.sleep(150);
    const orCard = await evalJs(`Boolean(document.getElementById("prov-openrouter"))`);
    const grokCard = await evalJs(`Boolean(document.getElementById("prov-grok"))`);
    if (orCard && grokCard) ok("Providers cards");
    else fail("missing OpenRouter/Grok provider cards");
    const recheck = await evalJs(`Boolean(document.getElementById("prov-recheck"))`);
    if (recheck) ok("Providers recheck");
    else fail("Providers recheck missing");
    await evalJs(`document.querySelector('[data-settings-tab="permissions"]')?.click()`);
    await Bun.sleep(100);
    const alwaysAdd = await evalJs(`Boolean(document.getElementById("always-add"))`);
    if (alwaysAdd) ok("Always Add");
    else fail("Always Add missing");
    await evalJs(`document.querySelector('[data-settings-tab="about"]')?.click()`);
    await Bun.sleep(100);
    const wsPath = await evalJs(`(document.getElementById("app-workspace-path")?.textContent || "").length > 0`);
    if (wsPath) ok("About workspace path");
    else fail("About workspace path empty");
    await evalJs(`document.querySelector('[data-settings-tab="jobs"]')?.click()`);
    await Bun.sleep(150);
    const jobsVisible = await evalJs(`document.querySelector('[data-settings-panel="jobs"]')?.hidden === false`);
    const titleBot = await evalJs(`Boolean(document.getElementById("job-title-bot"))`);
    if (jobsVisible) ok("Jobs tab panel");
    else fail("Jobs tab panel still hidden");
    if (!titleBot) ok("Title has no person picker");
    else fail("Title still has person picker");
    const compactModel = await evalJs(`Boolean(document.getElementById("job-compact-model"))`);
    const compactBot = await evalJs(`Boolean(document.getElementById("job-compact-bot"))`);
    if (!compactModel && compactBot) ok("Compact is a single agent picker");
    else fail("Compact still has model+person selects");
    const visionModel = await evalJs(`Boolean(document.getElementById("job-vision-model"))`);
    const readModel = await evalJs(`Boolean(document.getElementById("job-read-model"))`);
    if (!visionModel && !readModel) ok("Vision and Read are agent-only");
    else fail("Vision/Read still have model selects");
    const plus = await evalJs(`Boolean(document.querySelector(".attach-plus"))`);
    if (plus) ok("composer +");
    else fail("composer + missing");
    const jobNames = await evalJs(`[...document.querySelectorAll("#jobs-section .job-name")].map(n => n.textContent.replace(/\\s+/g," ").trim())`);
    const jn = Array.isArray(jobNames) ? jobNames.join(" | ") : String(jobNames);
    for (const n of ["Title", "Compact", "Vision", "Read"]) {
      if (jn.includes(n)) ok(`Jobs row ${n}`);
      else fail(`Jobs missing ${n}: ${jn}`);
    }
    const shot2 = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
    await Bun.write("tour/gh-settings-jobs.png", Buffer.from(shot2.data, "base64"));
    await evalJs(`document.getElementById("app-close")?.click() || document.getElementById("app-modal")?.close()`);
    await Bun.sleep(150);

    await evalJs(`
      const d = document.getElementById("draft") || document.querySelector(".draft");
      d.focus();
      d.value = "/";
      d.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await Bun.sleep(200);
    const slashIds = await evalJs(`[...document.querySelectorAll(".palette button")].map(b => b.textContent)`);
    const s = Array.isArray(slashIds) ? slashIds.map(String).join(" ") : String(slashIds);
    for (const id of ["/help", "/compact", "/status", "/new"]) {
      if (s.includes(id)) ok(`slash ${id}`);
      else fail(`slash missing ${id}: ${s.slice(0, 200)}`);
    }
    try {
      await evalJs(`(function(){
        const d = document.getElementById("draft") || document.querySelector(".draft");
        if (d) { d.value = ""; d.dispatchEvent(new Event("input", { bubbles: true })); }
        return true;
      })()`);
    } catch (err) {
      fail("clear draft: " + String(err).slice(0, 240));
    }

    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await Bun.sleep(300);
    const shot3 = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
    await Bun.write("tour/gh-mobile.png", Buffer.from(shot3.data, "base64"));
    ok("mobile screenshot");
    const menuBtn = await evalJs(
      `Boolean(document.getElementById("menu-btn") || document.querySelector(".menu-btn"))`,
    );
    if (menuBtn) ok("mobile menu chip present");
    else fail("mobile menu chip missing");
    const sendOnScreen = await evalJs(`(function(){
      const s = document.querySelector(".composer .send");
      if (!s) return false;
      const r = s.getBoundingClientRect();
      return r.width > 8 && r.right <= window.innerWidth + 2 && r.bottom <= window.innerHeight + 2;
    })()`);
    if (sendOnScreen) ok("mobile Send in viewport");
    else fail("mobile Send clipped or missing");
    const filesClip = await evalJs(`(function(){
      const f = document.querySelector(".files-btn");
      if (!f) return true;
      const r = f.getBoundingClientRect();
      return r.width > 0 && r.right <= window.innerWidth + 2;
    })()`);
    if (filesClip) ok("mobile files chip in viewport");
    else fail("mobile files chip overflow");

    ws.close();
  } finally {
    chrome.kill();
  }

  console.log(`\n${oks.length} ok, ${fails.length} fail`);
  if (fails.length) {
    for (const f of fails) console.log(" - " + f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
