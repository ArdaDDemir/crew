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
    "work-chip",
    "context-chip",
    "jobs-section",
    "slash-help",
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

    const logo = await evalJs("document.querySelector('.logo')?.textContent");
    if (logo === "Crew") ok("rail logo");
    else fail(`logo ${logo}`);

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

    const ch = await evalJs(`document.querySelector("#channel-list button")`);
    if (ch) {
      await evalJs(`
        const b = document.querySelector("#channel-list button");
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

    await evalJs(`document.getElementById("app-settings")?.click()`);
    await Bun.sleep(250);
    const jobsOpen = await evalJs(`document.getElementById("app-modal")?.open === true`);
    const jobsSection = await evalJs(`Boolean(document.getElementById("jobs-section"))`);
    if (jobsOpen) ok("Settings sheet open");
    else fail("Settings did not open");
    if (jobsSection) ok("Jobs section in Settings");
    else fail("Jobs section missing");
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
