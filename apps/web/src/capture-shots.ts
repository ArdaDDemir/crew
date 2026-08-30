/**
 * Capture README screenshots from a seeded office.
 * bun run apps/web/src/capture-shots.ts
 */
import { mkdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsWorkspace } from "@crew/workspace-fs";
import { ScriptedProvider } from "@crew/core";
import { startServer } from "./server";
import { saveFloor } from "./floor";
import { saveLooks } from "./looks";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP = 9334;
const assets = join(import.meta.dir, "..", "..", "..", "docs", "assets");

type CdpMsg = { id?: number; method?: string; result?: unknown; error?: { message: string } };

async function waitPort(port: number, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return;
    } catch {
      /* retry */
    }
    await Bun.sleep(200);
  }
  throw new Error("chrome debug port did not open");
}

async function main() {
  const cwd = await mkdtemp(join(tmpdir(), "crew-shots-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead", icon: "🧭" });
  ws.addBot({ id: "coder", name: "Coder", icon: "💻" });
  ws.addBot({ id: "designer", name: "Designer", icon: "🎨" });
  ws.addChannel({
    id: "landing",
    title: "Landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder", "designer"],
    permissionMode: "auto-accept",
  });
  ws.addChannel({
    id: "ops",
    title: "Ops",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  saveLooks(cwd, {
    bots: {
      lead: { skin: "mid", hair: "short", top: "polo" },
      coder: { skin: "dark", hair: "buzz", top: "hoodie" },
      designer: { skin: "light", hair: "ponytail", top: "sweater" },
    },
    humans: { human: { skin: "mid", hair: "curly", top: "tee" } },
  });
  saveFloor(cwd, "landing", {
    furniture: [
      { id: "p1", kind: "plant", x: 48, y: 232 },
      { id: "s1", kind: "sofa", x: 120, y: 228 },
      { id: "r1", kind: "rug", x: 88, y: 248 },
    ],
  });
  const provider = new ScriptedProvider([[{ type: "text-delta", text: "ack" }, { type: "done" }]]);
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url } = startServer({ cwd, provider, publicDir, port: 0 });
  mkdirSync(assets, { recursive: true });

  const chrome = Bun.spawn(
    [
      CHROME,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${join(tmpdir(), "crew-shots-chrome")}`,
      "--window-size=1600,900",
      url,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );

  try {
    await waitPort(CDP);
    const targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
      url: string;
    }[];
    const page =
      targets.find((t) => t.type === "page" && t.url.startsWith(url)) ??
      targets.find((t) => t.type === "page");
    if (!page) throw new Error("no chrome page");
    const wsock = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      wsock.addEventListener("open", () => res(null));
      wsock.addEventListener("error", () => rej(new Error("cdp ws")));
    });
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    wsock.addEventListener("message", (ev) => {
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
        wsock.send(JSON.stringify({ id, method, params }));
      });
    const evalJs = async (expression: string) => {
      const result = (await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result?: { value?: unknown }; exceptionDetails?: { text: string } };
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "eval");
      return result.result?.value;
    };
    const shot = async (name: string, clip?: { x: number; y: number; width: number; height: number }) => {
      const result = (await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      })) as { data: string };
      const dest = join(assets, name);
      await Bun.write(dest, Buffer.from(result.data, "base64"));
      console.log("wrote", dest);
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url });
    await Bun.sleep(1200);
    await evalJs(`sessionStorage.setItem("crew.deskOpen","1")`);
    await evalJs(
      `document.getElementById("desk-toggle")?.getAttribute("aria-pressed") === "true" || document.getElementById("desk-toggle")?.click()`,
    );
    await evalJs(`const cwd = document.getElementById("app-cwd"); if (cwd) { cwd.textContent = "crew"; cwd.title = "crew"; }`);
    await Bun.sleep(400);

    await shot("office.png");
    const floor = (await evalJs(`(() => {
      const el = document.getElementById("floor");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`)) as { x: number; y: number; width: number; height: number } | null;
    if (floor && floor.width > 40) {
      await shot("floor.png", {
        x: Math.max(0, floor.x),
        y: Math.max(0, floor.y),
        width: floor.width,
        height: floor.height,
      });
    }

    await evalJs(`
      const splitHost = document.getElementById("panes");
      const splitBar = document.getElementById("split-handle");
      const box = splitHost.getBoundingClientRect();
      const yy = box.top + Math.min(80, box.height / 2);
      splitBar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.right - 3, clientY: yy, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: box.left + box.width * 0.5, clientY: yy, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: box.left + box.width * 0.5, clientY: yy, pointerId: 1 }));
    `);
    await Bun.sleep(400);
    await shot("split.png");
    await evalJs(`document.querySelector(".pane-close")?.click()`);
    await Bun.sleep(250);

    await evalJs(`document.getElementById("app-settings")?.click()`);
    await Bun.sleep(400);
    await shot("settings.png");
    await evalJs(`document.getElementById("app-close")?.click()`);
    await Bun.sleep(200);

    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await Bun.sleep(500);
    await evalJs(`document.getElementById("menu-btn")?.click()`);
    await Bun.sleep(300);
    await shot("mobile.png");
  } finally {
    chrome.kill();
    server.stop(true);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
