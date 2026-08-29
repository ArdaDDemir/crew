import { expect, test } from "bun:test";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptedProvider } from "@crew/core";
import { FsWorkspace } from "@crew/workspace-fs";
import { startServer } from "./server";

async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addBot({ id: "coder", name: "Coder" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  writeFileSync(
    join(cwd, ".crew", "config.json"),
    `${JSON.stringify({ apiKey: "sk-test" })}\n`,
  );
  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "ack from lead" }, { type: "done" }],
  ]);
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url } = startServer({
    cwd,
    provider,
    publicDir,
    port: 0,
  });
  return { server, url, cwd };
}

test("bootstrap lists channels and health is ok", async () => {
  const { server, url } = await setup();
  try {
    const health = await (await fetch(`${url}/api/health`)).json();
    expect(health.ok).toBe(true);
    expect(health.version).toMatch(/^\d+\.\d+\.\d+$/);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(boot.updateUrl).toBe("");
    const upd = await (await fetch(`${url}/api/update-check`, { method: "POST" })).json();
    expect(upd.status).toBe("disabled");
    expect(boot.channels[0].id).toBe("landing");
    expect(boot.bots.map((b: { id: string }) => b.id)).toContain("coder");
    expect(Array.isArray(boot.models)).toBe(true);
    expect(Array.isArray(boot.dms)).toBe(true);
    const page = await fetch(`${url}/`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Crew");
    expect(html).toContain("id=\"direct\"");
  } finally {
    server.stop(true);
  }
});

test("DELETE bot/channel, skill body, and diff", async () => {
  const { server, url } = await setup();
  try {
    await fetch(`${url}/api/bot/coder/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "html", description: "HTML", body: "Use sections." }),
    });
    const skill = await (await fetch(`${url}/api/bot/coder/skills/html`)).json();
    expect(skill.body).toContain("Use sections.");
    expect(skill.markdown).toContain("name: html");
    const goneSkill = await fetch(`${url}/api/bot/coder/skills/html`, { method: "DELETE" });
    expect(goneSkill.ok).toBe(true);
    const missSkill = await fetch(`${url}/api/bot/coder/skills/html`, { method: "DELETE" });
    expect(missSkill.status).toBe(404);
    await fetch(`${url}/api/bot/coder/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "html", description: "HTML", body: "Use sections." }),
    });
    const gone = await fetch(`${url}/api/bot/coder`, { method: "DELETE" });
    expect(gone.ok).toBe(true);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.bots.map((b: { id: string }) => b.id)).not.toContain("coder");
    const miss = await fetch(`${url}/api/channel/nope`, { method: "DELETE" });
    expect(miss.status).toBe(404);
    const diff = await (await fetch(`${url}/api/diff?kind=channel&id=landing`)).json();
    expect(Array.isArray(diff)).toBe(true);
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"search\"");
    expect(page).toContain("id=\"jump-latest\"");
    expect(page).toContain("id=\"menu-btn\"");
    expect(page).toContain("id=\"nav-scrim\"");
    expect(page).toContain("id=\"skill-save\"");
    expect(page).toContain("id=\"skill-delete\"");
    expect(page).toContain("id=\"skill-preview\"");
    expect(page).toContain("id=\"skill-modal\"");
    expect(page).toContain("id=\"skill-open\"");
    expect(page).not.toContain("class=\"skill-add\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("openSkillSheet");
    expect(js).toContain("skillModal");
    expect(js).toContain("freezeHelp");
    expect(js).toContain("helpArmed");
    const css = await (await fetch(`${url}/app.css`)).text();
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("::-webkit-scrollbar-thumb");
    expect(css).toContain(".modal.sheet[open]");
    expect(css).toContain("dialog.modal:not([open])");
    expect(css).toContain("--go:");
    expect(css).toContain(".danger");
    expect(page).toContain("id=\"i-check\"");
    expect(page).toContain("id=\"i-trash\"");
    expect(page).toContain("class=\"danger\"");
    expect(page).toContain("id=\"bot-icon-btn\"");
    expect(page).toContain("class=\"help\"");
    expect(page).toContain("id=\"files-btn\"");
    expect(js).toContain("className = \"diff\"");
    expect(js).toContain("diff-add");
    expect(js).toContain("diff-del");
    expect(js).toContain("createElement(\"details\")");
    expect(css).toContain(".diff-add");
    expect(css).toContain(".diff-del");
    expect(css).toContain("pre.diff");
    expect(css).toContain(".chip[hidden]");
    expect(page).toContain("id=\"export-btn\"");
    expect(page).toContain("id=\"always-list\"");
    expect(page).toContain("id=\"ch-delete\"");
    expect(page).toContain("id=\"bot-delete\"");
    const perms = await (await fetch(`${url}/api/permissions`)).json();
    expect(perms.rules).toEqual([]);
    const cleared = await fetch(`${url}/api/permissions`, { method: "DELETE" });
    expect(cleared.ok).toBe(true);
  } finally {
    server.stop(true);
  }
});

test("POST /api/bots and /api/channels create from the UI APIs", async () => {
  const { server, url } = await setup();
  try {
    const bot = await fetch(`${url}/api/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "writer", name: "Writer", channelId: "landing" }),
    });
    expect(bot.ok).toBe(true);
    const ch = await fetch(`${url}/api/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "research", title: "Research" }),
    });
    expect(ch.ok).toBe(true);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.bots.map((b: { id: string }) => b.id)).toContain("writer");
    expect(boot.channels.map((c: { id: string }) => c.id)).toContain("research");
    const stop = await fetch(`${url}/api/stop`, { method: "POST" });
    expect(stop.ok).toBe(true);
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"add-channel\"");
    expect(page).toContain("id=\"stop\"");
    expect(page).toContain("id=\"palette\"");
  } finally {
    server.stop(true);
  }
});

test("POST /api/dm appears in bootstrap Direct list", async () => {
  const { server, url } = await setup();
  try {
    const res = await fetch(`${url}/api/dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "human", to: "coder", text: "hello coder" }),
    });
    expect(res.ok).toBe(true);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.dms[0].id).toBe("human__coder");
    expect(boot.dms[0].withHuman).toBe(true);
    expect(boot.dms[0].peerId).toBe("coder");
    expect(boot.dms[0].posted).toBeGreaterThanOrEqual(1);
    expect(String(boot.dms[0].lastText).length).toBeGreaterThan(0);
    const extra = await fetch(`${url}/api/dm/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "coder" }),
    });
    expect(extra.ok).toBe(true);
    const opened = await extra.json();
    expect(String(opened.id).startsWith("human__coder__")).toBe(true);
    const send = await fetch(`${url}/api/dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "human",
        to: "coder",
        text: "second job",
        threadId: opened.id,
      }),
    });
    expect(send.ok).toBe(true);
    const boot2 = await (await fetch(`${url}/api/bootstrap`)).json();
    const ids = boot2.dms.map((d: { id: string; peerId: string }) => d.id);
    expect(ids).toContain("human__coder");
    expect(ids).toContain(opened.id);
    expect(boot2.dms.filter((d: { peerId: string }) => d.peerId === "coder").length).toBe(2);
    expect(boot2.dms.find((d: { id: string }) => d.id === opened.id)?.permissionMode).toBe(
      "auto-accept",
    );
    const modeRes = await fetch(`${url}/api/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: opened.id, mode: "supervised" }),
    });
    expect(modeRes.ok).toBe(true);
    const boot3 = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot3.dms.find((d: { id: string }) => d.id === opened.id)?.permissionMode).toBe(
      "supervised",
    );
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"direct\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("renderDirect");
    expect(js).toContain("/api/dm/new");
    expect(js).toContain("kind: \"dm\"");
    expect(js).toContain("currentPermissionMode");
  } finally {
    server.stop(true);
  }
});

test("PATCH channel and bot persist customization", async () => {
  const { server, url } = await setup();
  try {
    const ch = await fetch(`${url}/api/channel/landing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Landing",
        icon: "⌂",
        folders: "src\npublic",
        context: "Ship the marketing page.",
      }),
    });
    expect(ch.ok).toBe(true);
    const got = await (await fetch(`${url}/api/channel/landing`)).json();
    expect(got.title).toBe("Landing");
    expect(got.icon).toBe("⌂");
    expect(got.folders).toEqual(["src", "public"]);
    const bot = await fetch(`${url}/api/bot/coder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Frontend",
        icon: "λ",
        soul: "Write HTML.",
        titleModel: "z-ai/glm-5.3-flash",
      }),
    });
    expect(bot.ok).toBe(true);
    const coder = await (await fetch(`${url}/api/bot/coder`)).json();
    expect(coder.name).toBe("Frontend");
    expect(coder.soul).toContain("Write HTML");
    expect(coder.titleModel).toBe("z-ai/glm-5.3-flash");
    const harness = await fetch(`${url}/api/bot/coder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ harness: "claude" }),
    });
    expect(harness.ok).toBe(true);
    const withHarness = await (await fetch(`${url}/api/bot/coder`)).json();
    expect(withHarness.harness).toBe("claude");
  } finally {
    server.stop(true);
  }
});

test("POST /api/mode updates the channel permission mode", async () => {
  const { server, url } = await setup();
  try {
    const res = await fetch(`${url}/api/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "landing", mode: "supervised" }),
    });
    expect(res.ok).toBe(true);
    const ch = await (await fetch(`${url}/api/channel/landing`)).json();
    expect(ch.permissionMode).toBe("supervised");
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"mode-btn\"");
    expect(page).toContain("id=\"here-list\"");
    expect(page).toContain("id=\"desk-label\"");
    expect(page).not.toContain("Not in the room");
    expect(page).toContain("id=\"ch-roster\"");
    expect(page).not.toContain("<select id=\"ch-lead\"");
    expect(page).toContain("data-mode=\"supervised\"");
    expect(page).toContain("data-mode=\"full-access\"");
    expect(page).not.toContain("id=\"tools-btn\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).not.toContain("toolsBtn");
    expect(js).toContain("modeModal");
    expect(js).toContain("class=\"mention\"");
    expect(js).toContain("appendThinking");
    expect(js).toContain("pointerover");
    expect(js).toContain("placeHelpTip");
    expect(js).not.toContain("help-bubble");
    expect(page).toContain("class=\"help\"");
    expect(page).toContain("data-tip=");
  } finally {
    server.stop(true);
  }
});

test("allowed models, fallback, and bot fallback persist", async () => {
  const { server, url } = await setup();
  try {
    const allowed = await fetch(`${url}/api/allowed-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["anthropic/claude-sonnet-4", "x-ai/grok-4"] }),
    });
    expect(allowed.ok).toBe(true);
    const fb = await fetch(`${url}/api/fallback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "x-ai/grok-4" }),
    });
    expect(fb.ok).toBe(true);
    const bot = await fetch(`${url}/api/bot/coder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        fallbackModel: "x-ai/grok-4",
      }),
    });
    expect(bot.ok).toBe(true);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.models).toEqual(["anthropic/claude-sonnet-4", "x-ai/grok-4"]);
    expect(boot.fallbackModel).toBe("x-ai/grok-4");
    expect(boot.posted).toBeDefined();
    const coder = await (await fetch(`${url}/api/bot/coder`)).json();
    expect(coder.model).toBe("anthropic/claude-sonnet-4");
    expect(coder.fallbackModel).toBe("x-ai/grok-4");
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"app-settings\"");
    expect(page).toContain("id=\"catalog\"");
    expect(page).not.toContain("id=\"model-btn\"");
    expect(page).not.toContain("id=\"thinking-btn\"");
  } finally {
    server.stop(true);
  }
});

test("GET /api/models searches the OpenRouter catalog", async () => {
  const { resetCatalogCache } = await import("./host");
  resetCatalogCache();
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input);
    if (href.includes("openrouter.ai")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "anthropic/claude-sonnet-4",
              name: "Claude Sonnet 4",
              description: "Fast coding model",
              context_length: 200000,
              pricing: { prompt: "0.000003", completion: "0.000015" },
              architecture: { modality: "text->text" },
            },
            {
              id: "x-ai/grok-4",
              name: "Grok 4",
              description: "xAI flagship",
              context_length: 256000,
              pricing: { prompt: "0", completion: "0" },
              architecture: { modality: "text->text" },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    return original(input, init);
  }) as typeof fetch;
  const { server, url } = await setup();
  try {
    const res = await (await fetch(`${url}/api/models?q=claude`)).json();
    expect(res.models[0].id).toBe("anthropic/claude-sonnet-4");
    expect(res.models[0].name).toContain("Claude");
    expect(res.models.length).toBe(1);
  } finally {
    globalThis.fetch = original;
    resetCatalogCache();
    server.stop(true);
  }
});

test("POST /api/attach writes under inbox and rejects traversal", async () => {
  const { server, url, cwd } = await setup();
  try {
    const ok = await fetch(`${url}/api/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "note.md", content: Buffer.from("hello attach").toString("base64") }],
      }),
    });
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(data.paths).toEqual(["inbox/note.md"]);
    const written = await Bun.file(join(cwd, "inbox", "note.md")).text();
    expect(written).toBe("hello attach");
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"attach-file\"");
    expect(page).toContain("id=\"attach-folder\"");
    expect(page).toContain("id=\"ch-id\"");
    expect(page).toContain("id=\"bot-id\"");
    expect(page).toMatch(/id="ch-id"[^>]*readonly/);
    expect(page).toMatch(/id="bot-id"[^>]*readonly/);
    const nested = await fetch(`${url}/api/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "docs/a.md", content: Buffer.from("n").toString("base64") }],
      }),
    });
    expect((await nested.json()).paths).toEqual(["inbox/docs/a.md"]);
    const bad = await fetch(`${url}/api/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "../secret.txt", content: Buffer.from("x").toString("base64") }],
      }),
    });
    expect(bad.status).toBe(400);
    const env = await fetch(`${url}/api/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ path: ".env", content: Buffer.from("k=v").toString("base64") }],
      }),
    });
    expect(env.status).toBe(400);
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("attachFiles");
    expect(js).toContain("fillBotRooms");
  } finally {
    server.stop(true);
  }
});

test("POST /api/model updates the workspace model", async () => {
  const { server, url } = await setup();
  try {
    const res = await fetch(`${url}/api/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-4o-mini" }),
    });
    expect(res.ok).toBe(true);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.model).toBe("openai/gpt-4o-mini");
  } finally {
    server.stop(true);
  }
});

test("invite token say posts as that human; loopback say stays owner", async () => {
  const { server, url, cwd } = await setup();
  try {
    const empty = await (await fetch(`${url}/api/humans`)).json();
    expect(empty).toEqual({ ownerId: "human", humans: [] });
    const created = await fetch(`${url}/api/humans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "arda", handle: "Arda" }),
    });
    expect(created.ok).toBe(true);
    const invited = (await created.json()) as { id: string; handle: string; token: string };
    expect(invited.id).toBe("arda");
    expect(invited.token.length).toBeGreaterThan(16);
    const listed = await (await fetch(`${url}/api/humans`)).json();
    expect(JSON.stringify(listed)).not.toContain(invited.token);
    expect(listed.humans).toEqual([{ id: "arda", handle: "Arda", invited: true }]);
    const disk = await Bun.file(join(cwd, ".crew", "humans.json")).text();
    expect(disk).toContain("arda");
    expect(disk).not.toContain(invited.token);

    const say = await fetch(`${url}/api/say`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({
        channelId: "landing",
        text: "hello from arda @lead",
      }),
    });
    const sayBody = await say.text();
    expect(sayBody).toContain("ack from lead");
    const log = await Bun.file(join(cwd, ".crew", "logs", "channel-landing.jsonl")).text();
    expect(log).toContain('"humanId":"arda"');

    await fetch(`${url}/api/humans/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "arda" }),
    });
    const dead = await fetch(`${url}/api/say`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({
        channelId: "landing",
        text: "should fail",
      }),
    });
    expect(dead.status).toBe(401);
    expect(await dead.text()).toContain("invalid invite");
  } finally {
    server.stop(true);
  }
});

test("invite create and revoke are owner-only; guest bearer is 403", async () => {
  const { server, url } = await setup();
  try {
    const created = await fetch(`${url}/api/humans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "arda", handle: "Arda" }),
    });
    expect(created.ok).toBe(true);
    const invited = (await created.json()) as { token: string };
    const guestMint = await fetch(`${url}/api/humans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({ id: "eve", handle: "Eve" }),
    });
    expect(guestMint.status).toBe(403);
    expect(await guestMint.text()).toContain("owner only");
    const listed = await (await fetch(`${url}/api/humans`)).json();
    expect(listed.humans.map((h: { id: string }) => h.id)).toEqual(["arda"]);
    const guestRevoke = await fetch(`${url}/api/humans/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({ id: "arda" }),
    });
    expect(guestRevoke.status).toBe(403);
    const badMint = await fetch(`${url}/api/humans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer nope",
      },
      body: JSON.stringify({ id: "eve", handle: "Eve" }),
    });
    expect(badMint.status).toBe(401);
    expect(await badMint.text()).toContain("invalid invite");
  } finally {
    server.stop(true);
  }
});

test("guest bearer cannot create bots; GET /api/who names the actor", async () => {
  const { server, url } = await setup();
  try {
    const whoOwner = await (await fetch(`${url}/api/who`)).json();
    expect(whoOwner).toEqual({ id: "human", handle: "owner", owner: true });
    const created = await fetch(`${url}/api/humans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "arda", handle: "Arda" }),
    });
    const invited = (await created.json()) as { token: string };
    const whoGuest = await (
      await fetch(`${url}/api/who`, { headers: { Authorization: `Bearer ${invited.token}` } })
    ).json();
    expect(whoGuest).toEqual({ id: "arda", handle: "Arda", owner: false });
    const badWho = await fetch(`${url}/api/who`, { headers: { Authorization: "Bearer nope" } });
    expect(badWho.status).toBe(401);
    const guestBot = await fetch(`${url}/api/bots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({ id: "hacker", name: "Hacker" }),
    });
    expect(guestBot.status).toBe(403);
    expect(await guestBot.text()).toContain("owner only");
    const guestAttach = await fetch(`${url}/api/attach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({ files: [{ path: "x.txt", content: "nope" }] }),
    });
    expect(guestAttach.status).toBe(403);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.bots.map((b: { id: string }) => b.id)).not.toContain("hacker");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("/api/who");
  } finally {
    server.stop(true);
  }
});

test("identity chip and invite settings are in the office page", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain('id="who-chip"');
    expect(page).toContain('id="who-token"');
    expect(page).toContain('id="invite-create"');
    expect(page).toContain('id="invite-list"');
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("crew.inviteToken");
    expect(js).toContain("inviteHeaders");
    expect(js).toMatch(/Authorization.*Bearer/);
    const open = js.slice(js.indexOf("async function openAppSettings"));
    const body = open.slice(0, open.indexOf("\ndocument.getElementById(\"invite-create\")"));
    expect(body).toContain("invite-once");
    expect(body).toContain("hidden = true");
  } finally {
    server.stop(true);
  }
});

test("say streams an account into the channel log", async () => {
  const { server, url } = await setup();
  try {
    const res = await fetch(`${url}/api/say`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "landing", text: "hello lead" }),
    });
    const body = await res.text();
    expect(body).toContain("ack from lead");
    expect(body).toContain('"woken"');
    const thread = await (
      await fetch(`${url}/api/thread?kind=channel&id=landing`)
    ).json();
    expect(JSON.stringify(thread)).toContain("hello lead");
    expect(JSON.stringify(thread)).toContain("ack from lead");
  } finally {
    server.stop(true);
  }
});

test("GET /api/shot serves a browser png and rejects escapes", async () => {
  const { server, url, cwd } = await setup();
  try {
    const dir = join(cwd, ".crew", "browser", "shots");
    mkdirSync(dir, { recursive: true });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    writeFileSync(join(dir, "1.png"), png);
    const ok = await fetch(`${url}/api/shot?path=.crew/browser/shots/1.png`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type") ?? "").toMatch(/image\/png/i);
    expect(Buffer.from(await ok.arrayBuffer()).length).toBeGreaterThan(10);
    const escape = await fetch(`${url}/api/shot?path=../.env`);
    expect(escape.status).toBe(403);
    const env = await fetch(`${url}/api/shot?path=.crew/browser/shots/../../.env`);
    expect(env.status).toBe(403);
    const miss = await fetch(`${url}/api/shot?path=.crew/browser/shots/nope.png`);
    expect(miss.status).toBe(404);
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("desk-shot");
    expect(js).toContain("/api/shot");
  } finally {
    server.stop(true);
  }
});

test("say verbose stream includes a screenshot after the tool completes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  writeFileSync(join(cwd, ".crew", "config.json"), `${JSON.stringify({ apiKey: "sk-test" })}\n`);
  const { MemoryBrowser, nativeTools } = await import("@crew/tools-native");
  const browser = new MemoryBrowser();
  browser.seed("https://example.test/", { title: "Hi", nodes: [] });
  const provider = new ScriptedProvider([
    [
      {
        type: "tool-call",
        id: "1",
        name: "browser_open",
        arguments: JSON.stringify({ url: "https://example.test/" }),
      },
      { type: "done" },
    ],
    [
      { type: "tool-call", id: "2", name: "browser_screenshot", arguments: "{}" },
      { type: "done" },
    ],
    [{ type: "text-delta", text: "shot taken" }, { type: "done" }],
  ]);
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url, host } = startServer({ cwd, provider, publicDir, port: 0 });
  host.tools = nativeTools({ browser });
  try {
    const res = await fetch(`${url}/api/say`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: "landing",
        text: "take a screenshot",
        thinking: true,
        verbose: true,
      }),
    });
    const body = await res.text();
    expect(body).toContain("browser_screenshot");
    expect(body).toMatch(/\.crew\/browser\/shots\/.+\.png/);
    expect(body).toContain('"shot"');
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toMatch(/appendTool\(row\.botId, row\.name, row\.args, row\.output, row\.shot\)/);
  } finally {
    server.stop(true);
  }
});

test("jump palette is in the office page", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"jump\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("openJump");
    expect(js).toMatch(/key === ["']k["']/);
  } finally {
    server.stop(true);
  }
});

test("context menu is in the office page", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"ctx-menu\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("openMenu");
    expect(js).toContain("contextmenu");
    expect(js).toContain("splitOpen");
  } finally {
    server.stop(true);
  }
});

test("composer slash table includes compact and status", async () => {
  const { server, url } = await setup();
  try {
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("compact");
    expect(js).toContain("status");
    expect(js).toMatch(/id:\s*"compact"/);
    expect(js).toMatch(/id:\s*"status"/);
    expect(js).toMatch(/id:\s*"help"/);
    expect(js).toMatch(/id:\s*"diff"/);
    expect(js).toMatch(/id:\s*"export"/);
    expect(js).toMatch(/id:\s*"new"/);
    expect(js).toMatch(/id:\s*"mode"/);
    expect(js).toMatch(/id:\s*"model"/);
    expect(js).toMatch(/id:\s*"stop"/);
    expect(js).toMatch(/id:\s*"clear"/);
    expect(js).toMatch(/id:\s*"retry"/);
    expect(js).toMatch(/id:\s*"new-person"/);
    expect(js).toMatch(/id:\s*"new-channel"/);
    expect(js).toMatch(/id:\s*"settings"/);
    expect(js).toContain("/api/compact");
    expect(js).toContain("Compact is not ready yet.");
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"slash-help\"");
  } finally {
    server.stop(true);
  }
});

test("split panes are in the office page", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"pane-0\"");
    expect(page).toContain("id=\"pane-1\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("splitOpen");
    expect(js).toContain("application/x-crew-thread");
    expect(js).toContain("paneOpen");
    expect(js).toMatch(
      /function activatePane\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*renderPresence/,
    );
    expect(js).toMatch(/activePane !== state\.runPane/);
    expect(js).toContain("Wait for the current run to finish.");
    expect(js).toMatch(/state\.running && idx !== state\.runPane/);
  } finally {
    server.stop(true);
  }
});

test("GET/PUT /api/looks: owner sets bots; guest may only set self", async () => {
  const { server, url } = await setup();
  try {
    const empty = await (await fetch(`${url}/api/looks`)).json();
    expect(empty).toEqual({ bots: {}, humans: {} });
    const ownerBot = await fetch(`${url}/api/looks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId: "coder", skin: "dark", hair: "short", top: "hoodie" }),
    });
    expect(ownerBot.ok).toBe(true);
    const created = await fetch(`${url}/api/humans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "arda", handle: "Arda" }),
    });
    const invited = (await created.json()) as { token: string };
    const guestBot = await fetch(`${url}/api/looks`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({ botId: "coder", hair: "buzz" }),
    });
    expect(guestBot.status).toBe(403);
    const guestSelf = await fetch(`${url}/api/looks`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({ hair: "ponytail", top: "tee" }),
    });
    expect(guestSelf.ok).toBe(true);
    const listed = await (await fetch(`${url}/api/looks`)).json();
    expect(listed.bots.coder.top).toBe("hoodie");
    expect(listed.humans.arda.hair).toBe("ponytail");
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain('id="floor-look"');
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("applyFloorLook");
  } finally {
    server.stop(true);
  }
});

test("GET/PUT /api/floor roundtrips furniture; guest cannot place", async () => {
  const { server, url } = await setup();
  try {
    const empty = await (await fetch(`${url}/api/floor?id=landing`)).json();
    expect(empty).toEqual({ channelId: "landing", furniture: [] });
    const put = await fetch(`${url}/api/floor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "landing",
        furniture: [{ id: "p1", kind: "plant", x: 40, y: 90 }],
      }),
    });
    expect(put.ok).toBe(true);
    const got = await (await fetch(`${url}/api/floor?id=landing`)).json();
    expect(got.furniture).toEqual([{ id: "p1", kind: "plant", x: 40, y: 90 }]);
    const miss = await fetch(`${url}/api/floor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "nope", furniture: [] }),
    });
    expect(miss.status).toBe(400);
    const created = await fetch(`${url}/api/humans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "arda", handle: "Arda" }),
    });
    const invited = (await created.json()) as { token: string };
    const guestPut = await fetch(`${url}/api/floor`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invited.token}`,
      },
      body: JSON.stringify({
        id: "landing",
        furniture: [{ id: "x", kind: "sofa", x: 1, y: 1 }],
      }),
    });
    expect(guestPut.status).toBe(403);
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain('id="floor-kit"');
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("placeFurniture");
    expect(js).toContain("floor-furn");
  } finally {
    server.stop(true);
  }
});

test("floor doors switch channel", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain('id="floor-doors"');
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("renderFloorDoors");
    expect(js).toContain("floor-door");
    expect(js).toMatch(/paneOpen\(state\.activePane, ["']channel["']/);
    expect(js).toContain("closest(\".floor-door\")");
    const css = await (await fetch(`${url}/app.css`)).text();
    expect(css).toContain(".floor-door");
  } finally {
    server.stop(true);
  }
});

test("floor click-to-walk and writing walks to the table", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain('id="floor-you"');
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("walkYou");
    expect(js).toContain("bindFloorWalk");
    expect(js).toContain("tableSlot");
    expect(js).toMatch(/pose === ["']writing["']/);
    expect(js).toContain("closest(\".floor-seat\")");
    const css = await (await fetch(`${url}/app.css`)).text();
    expect(css).toMatch(/\.floor-you[\s\S]{0,200}transition/);
  } finally {
    server.stop(true);
  }
});

test("floor hint and holding cursor are in the office", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain('id="floor-hint"');
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("paintFloorHint");
    expect(js).toContain("Click carpet to walk");
    expect(js).toContain("Esc to cancel");
    const css = await (await fetch(`${url}/app.css`)).text();
    expect(css).toContain(".floor-scene.holding");
  } finally {
    server.stop(true);
  }
});

test("floor hold Escape cancels; guest does not remove furniture", async () => {
  const { server, url } = await setup();
  try {
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain('key === "Escape"');
    expect(js).toContain("clearFloorHold");
    expect(js).toMatch(/function removeFurniture[\s\S]{0,200}inviteToken\(\)/);
    expect(js).toMatch(/function placeFurniture[\s\S]{0,180}inviteToken\(\)/);
  } finally {
    server.stop(true);
  }
});

test("floor furniture fetch is keyed by room and look save is debounced", async () => {
  const { server, url } = await setup();
  try {
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("floorFurnRoom");
    expect(js).toContain("floorFetchSeq");
    expect(js).toContain("flushYouLook");
    expect(js).toMatch(/lookTimer/);
  } finally {
    server.stop(true);
  }
});

test("isometric floor is in the office desk", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain('id="floor"');
    expect(page).toContain("floor-glass");
    expect(page).toContain("floor-seats");
    expect(page).toContain("floor-desks");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("renderFloor");
    expect(js).toContain("floor-seat");
    expect(js).toContain("human__");
    const css = await (await fetch(`${url}/app.css`)).text();
    expect(css).toContain(".floor-scene");
    expect(css).toContain("prefers-reduced-motion");
  } finally {
    server.stop(true);
  }
});

test("work chip is in the office header", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"work-chip\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("work-chip");
    expect(js).toContain("renderWorkChip");
  } finally {
    server.stop(true);
  }
});

test("GET /api/paths lists workspace files", async () => {
  const { server, url, cwd } = await setup();
  try {
    writeFileSync(join(cwd, "hello.ts"), "export {}\n");
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "src", "app.ts"), "export {}\n");
    const res = await (await fetch(`${url}/api/paths?q=hello`)).json();
    expect(res.paths).toContain("hello.ts");
    const nested = await (await fetch(`${url}/api/paths?q=app.ts`)).json();
    expect(nested.paths).toContain("src/app.ts");
  } finally {
    server.stop(true);
  }
});

test("GET /api/paths skips secrets and empty queries", async () => {
  const { server, url, cwd } = await setup();
  try {
    writeFileSync(join(cwd, ".env"), "SECRET=1\n");
    writeFileSync(join(cwd, ".env.local"), "SECRET=2\n");
    mkdirSync(join(cwd, ".ssh"));
    writeFileSync(join(cwd, ".ssh", "id_rsa"), "nope\n");
    writeFileSync(join(cwd, "src-env.ts"), "export {}\n");
    const envQ = await (await fetch(`${url}/api/paths?q=env`)).json();
    expect(envQ.paths).not.toContain(".env");
    expect(envQ.paths).not.toContain(".env.local");
    expect(envQ.paths).toContain("src-env.ts");
    const sshQ = await (await fetch(`${url}/api/paths?q=id_rsa`)).json();
    expect(sshQ.paths ?? []).not.toContain(".ssh/id_rsa");
    expect((sshQ.paths ?? []).some((p: string) => p.includes(".ssh"))).toBe(false);
    const missing = await fetch(`${url}/api/paths`);
    expect(missing.status === 400 || missing.ok).toBe(true);
    if (missing.ok) {
      const body = await missing.json();
      expect(body.paths).toEqual([]);
    }
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("/api/paths");
    expect(js).toContain("isComposing");
    expect(js).toContain("keyCode === 229");
    expect(js).toContain("(@(?:[A-Za-z0-9_./-]*))");
    const replaceFn = js.slice(js.indexOf("function replaceAtToken"), js.indexOf("function paintPaletteOn"));
    expect(replaceFn).toContain("slice(caret)");
    expect(replaceFn).toMatch(/\$\{insert\}.*slice\(caret\)|slice\(caret\).*\$\{insert\}/);
    expect(js).toContain("pathPending");
    expect(js).toMatch(/if \(pathPending\)/);
    expect(js).not.toContain("!bots.length && !wantPaths");
  } finally {
    server.stop(true);
  }
});

test("GET /api/paths skips resolved denylist targets", async () => {
  const { server, url, cwd } = await setup();
  try {
    writeFileSync(join(cwd, ".env"), "SECRET=1\n");
    mkdirSync(join(cwd, ".ssh"));
    writeFileSync(join(cwd, ".ssh", "id_rsa"), "nope\n");
    mkdirSync(join(cwd, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(cwd, "node_modules", "pkg", "index.js"), "export {}\n");
    writeFileSync(join(cwd, "open.ts"), "export {}\n");
    const sshWalk = await (await fetch(`${url}/api/paths?q=id_rsa`)).json();
    expect((sshWalk.paths ?? []).some((p: string) => p.split("/").includes(".ssh"))).toBe(false);
    let envAlias = false;
    try {
      symlinkSync(join(cwd, ".env"), join(cwd, "alias-env.ts"));
      envAlias = true;
    } catch {
      /* Windows may refuse file symlinks without privilege */
    }
    if (envAlias) {
      const aliased = await (await fetch(`${url}/api/paths?q=alias-env`)).json();
      expect(aliased.paths ?? []).not.toContain("alias-env.ts");
    }
    let modsLink = false;
    try {
      symlinkSync(join(cwd, "node_modules"), join(cwd, "mods"), "junction");
      modsLink = true;
    } catch {
      /* junction not available */
    }
    if (modsLink) {
      const leaked = await (await fetch(`${url}/api/paths?q=index.js`)).json();
      expect((leaked.paths ?? []).some((p: string) => p.startsWith("mods/"))).toBe(false);
      expect((leaked.paths ?? []).some((p: string) => p.split("/").includes("node_modules"))).toBe(
        false,
      );
    }
  } finally {
    server.stop(true);
  }
});

test("GET /api/watch is an event stream with posted counts", async () => {
  const { server, url } = await setup();
  try {
    const res = await fetch(`${url}/api/watch`);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain("data:");
    expect(chunk).toContain("posted");
    await reader.cancel();
    const page = await (await fetch(`${url}/app.js`)).text();
    expect(page).toContain("EventSource");
    expect(page).toContain("/api/watch");
  } finally {
    server.stop(true);
  }
});

test("POST /api/compact appends thread.summary and GET compact-status", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  writeFileSync(join(cwd, ".crew", "config.json"), `${JSON.stringify({ apiKey: "sk-test" })}\n`);
  writeFileSync(
    join(cwd, ".crew", "jobs.json"),
    `${JSON.stringify({ compact: { model: "z-ai/glm-5.3-flash" } })}\n`,
  );
  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "User intent: land it." }, { type: "done" }],
  ]);
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url, host } = startServer({ cwd, provider, publicDir, port: 0 });
  try {
    const thread = { kind: "channel" as const, id: "landing" };
    host.store.append({
      v: 1,
      id: "m1",
      ts: "t",
      thread,
      type: "message.posted",
      parent: null,
      payload: { author: { kind: "human" }, text: "hello lead" },
    });
    const missing = await fetch(`${url}/api/compact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "channel" }),
    });
    expect(missing.status).toBe(400);
    const before = host.store.read(thread).length;
    const res = await fetch(`${url}/api/compact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "channel", id: "landing" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toContain("land it");
    expect(body.keptFrom).toBe("m1");
    expect(body.model).toBe("z-ai/glm-5.3-flash");
    const after = host.store.read(thread);
    expect(after.length).toBe(before + 1);
    expect(after.filter((e) => e.type === "message.posted")).toHaveLength(1);
    expect(after.some((e) => e.type === "thread.summary")).toBe(true);
    const status = await (await fetch(`${url}/api/compact-status?kind=channel&id=landing`)).json();
    expect(status.posted).toBe(1);
    expect(status.keep).toBe(80);
    expect(status.hasSummary).toBe(true);
    expect(status.lastCompactAt).toBeTruthy();
    const noId = await fetch(`${url}/api/compact-status?kind=channel`);
    expect(noId.status).toBe(400);
  } finally {
    server.stop(true);
  }
});

test("POST /api/compact returns 400 on empty summary", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  writeFileSync(join(cwd, ".crew", "config.json"), `${JSON.stringify({ apiKey: "sk-test" })}\n`);
  const provider = new ScriptedProvider([[{ type: "text-delta", text: "" }, { type: "done" }]]);
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url, host } = startServer({ cwd, provider, publicDir, port: 0 });
  try {
    host.store.append({
      v: 1,
      id: "m1",
      ts: "t",
      thread: { kind: "channel", id: "landing" },
      type: "message.posted",
      parent: null,
      payload: { author: { kind: "human" }, text: "hi" },
    });
    const res = await fetch(`${url}/api/compact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "channel", id: "landing" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("empty summary");
  } finally {
    server.stop(true);
  }
});

test("office page has context chip and auto-compact", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"context-chip\"");
    expect(page).toContain("class=\"context-chip\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("/api/compact-status");
    expect(js).toContain("crew.autoCompact");
    expect(js).toContain("Compacted.");
    expect(js).toContain("keep * 0.7");
    const css = await (await fetch(`${url}/app.css`)).text();
    expect(css).toContain(".context-chip");
  } finally {
    server.stop(true);
  }
});

test("GET /api/jobs returns defaults and PUT roundtrips", async () => {
  const { server, url, cwd } = await setup();
  try {
    const missing = await (await fetch(`${url}/api/jobs`)).json();
    expect(missing).toEqual({
      title: { model: "", botId: null, harness: null, harnessModel: null },
      compact: { model: "", botId: null, harness: null, harnessModel: null },
      vision: { model: "", botId: null, harness: null, harnessModel: null },
      read: { model: "", botId: null, harness: null, harnessModel: null },
    });
    const put = await fetch(`${url}/api/jobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: { model: "z-ai/glm-5.3-flash", botId: null },
        compact: { model: "openai/gpt-4o-mini", botId: "coder" },
        vision: { model: "", botId: null },
        read: { model: "", botId: null },
      }),
    });
    expect(put.status).toBe(200);
    const saved = await put.json();
    expect(saved.compact.botId).toBe("coder");
    const got = await (await fetch(`${url}/api/jobs`)).json();
    expect(got).toEqual(saved);
    const disk = JSON.parse(await Bun.file(join(cwd, ".crew", "jobs.json")).text());
    expect(disk).toEqual(saved);
    const bad = await fetch(`${url}/api/jobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: { model: "", botId: "human" },
        compact: { model: "", botId: null },
        vision: { model: "", botId: null },
        read: { model: "", botId: null },
      }),
    });
    expect(bad.status).toBe(400);
    const unknown = await fetch(`${url}/api/jobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: { model: "", botId: "nope" },
        compact: { model: "", botId: null },
        vision: { model: "", botId: null },
        read: { model: "", botId: null },
      }),
    });
    expect(unknown.status).toBe(400);
  } finally {
    server.stop(true);
  }
});

test("POST /api/dm human first message appends thread.titled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "coder", name: "Coder" });
  writeFileSync(join(cwd, ".crew", "config.json"), `${JSON.stringify({ apiKey: "sk-test" })}\n`);
  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "ack from coder" }, { type: "done" }],
    [
      {
        type: "text-delta",
        text: '{"title":"Hello Coder","description":"First hello in Direct."}',
      },
      { type: "done" },
    ],
    [{ type: "text-delta", text: "ack again" }, { type: "done" }],
    [
      {
        type: "text-delta",
        text: '{"title":"Hero chat","description":"Land the hero."}',
      },
      { type: "done" },
    ],
  ]);
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url, host } = startServer({ cwd, provider, publicDir, port: 0 });
  try {
    const res = await fetch(`${url}/api/dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "human", to: "coder", text: "hello coder, please land the hero" }),
    });
    expect(res.ok).toBe(true);
    const events = host.store.read({ kind: "dm", id: "human__coder" });
    const titled = events.filter((e) => e.type === "thread.titled");
    expect(titled).toHaveLength(1);
    expect(titled[0]?.payload.title).toBe("Hello Coder");
    expect(titled[0]?.payload.description).toBe("First hello in Direct.");
    expect(titled[0]?.payload.model).toBeTruthy();
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    const dm = boot.dms.find((d: { id: string }) => d.id === "human__coder");
    expect(dm.title).toBe("Hello Coder");
    expect(dm.description).toBe("First hello in Direct.");
    const again = await fetch(`${url}/api/dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "human", to: "coder", text: "second" }),
    });
    expect(again.ok).toBe(true);
    expect(host.store.read({ kind: "dm", id: "human__coder" }).filter((e) => e.type === "thread.titled")).toHaveLength(
      1,
    );
    const regen = await fetch(`${url}/api/thread-title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "dm", id: "human__coder" }),
    });
    expect(regen.status).toBe(200);
    const titled2 = host.store.read({ kind: "dm", id: "human__coder" }).filter((e) => e.type === "thread.titled");
    expect(titled2).toHaveLength(2);
    expect(titled2[1]?.payload.title).toBe("Hero chat");
    const boot2 = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot2.dms.find((d: { id: string }) => d.id === "human__coder").title).toBe("Hero chat");
  } finally {
    server.stop(true);
  }
});

test("POST /api/attach captions images when vision model is set", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead" });
  writeFileSync(join(cwd, ".crew", "config.json"), `${JSON.stringify({ apiKey: "sk-test" })}\n`);
  writeFileSync(
    join(cwd, ".crew", "jobs.json"),
    `${JSON.stringify({ vision: { model: "z-ai/glm-5.3-flash", botId: null } }, null, 2)}\n`,
  );
  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "A red square on a desk." }, { type: "done" }],
  ]);
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url } = startServer({ cwd, provider, publicDir, port: 0 });
  try {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const res = await fetch(`${url}/api/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [{ path: "pic.png", content: png }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paths).toEqual(["inbox/pic.png"]);
    expect(body.captions["inbox/pic.png"]).toContain("red square");
  } finally {
    server.stop(true);
  }
});

test("POST /api/attach captions when vision job is an agent with empty model slot", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addBot({ id: "seer", name: "Seer", model: "person/vision" });
  writeFileSync(join(cwd, ".crew", "config.json"), `${JSON.stringify({ apiKey: "sk-test" })}\n`);
  writeFileSync(
    join(cwd, ".crew", "jobs.json"),
    `${JSON.stringify({ vision: { model: "", botId: "seer" } }, null, 2)}\n`,
  );
  const seen: string[] = [];
  const inner = new ScriptedProvider([
    [{ type: "text-delta", text: "A red square on a desk." }, { type: "done" }],
  ]);
  const provider = {
    async *complete(req: { model: string }) {
      seen.push(req.model);
      yield* inner.complete(req);
    },
  };
  const publicDir = join(import.meta.dir, "..", "public");
  const { server, url } = startServer({ cwd, provider, publicDir, port: 0 });
  try {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const res = await fetch(`${url}/api/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [{ path: "pic.png", content: png }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.captions["inbox/pic.png"]).toContain("red square");
    expect(seen).toEqual(["person/vision"]);
  } finally {
    server.stop(true);
  }
});

test("office settings has Jobs section", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"jobs-section\"");
    expect(page).toContain("data-settings-tab=\"providers\"");
    expect(page).not.toContain("data-settings-tab=\"models\"");
    expect(page).toContain("id=\"prov-openrouter\"");
    expect(page).toContain("id=\"prov-claude\"");
    expect(page).toContain("id=\"prov-codex\"");
    expect(page).toContain("id=\"prov-grok\"");
    expect(page).toContain("id=\"prov-opencode\"");
    expect(page).toContain("id=\"always-add\"");
    expect(page).toContain("id=\"app-default-mode\"");
    expect(page).toContain("id=\"app-auto-compact\"");
    expect(page).toContain("id=\"app-reviewer-model\"");
    expect(page).toContain("id=\"app-base-url\"");
    expect(page).toContain("id=\"app-workspace-path\"");
    expect(page).toContain("id=\"job-title-model\"");
    expect(page).toContain("id=\"job-compact-bot\"");
    expect(page).toContain("id=\"job-vision-bot\"");
    expect(page).toContain("id=\"job-read-bot\"");
    expect(page).not.toContain("id=\"job-compact-model\"");
    expect(page).not.toContain("id=\"job-vision-model\"");
    expect(page).not.toContain("id=\"job-read-model\"");
    expect(page).toContain("id=\"title-regen\"");
    expect(page).toContain("data-settings-tab=\"general\"");
    expect(page).toContain("data-settings-tab=\"jobs\"");
    expect(page).toContain("data-settings-tab=\"mcp\"");
    expect(page).toContain("id=\"mcp-section\"");
    expect(page).toContain("resources list/read");
    expect(page).toContain("prompts list/get");
    expect(page).toContain("data-settings-tab=\"about\"");
    expect(page).toContain("id=\"app-update-check\"");
    expect(page).toContain("id=\"app-update-url\"");
    expect(page).toContain("id=\"bot-title-model\"");
    expect(page).toContain("attach-plus");
    expect(page).not.toContain("id=\"job-title-bot\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("/api/jobs");
    expect(js).toContain("/api/thread-title");
    expect(js).toContain("[image ");
    expect(js).toContain("switchSettingsTab");
    const css = await (await fetch(`${url}/app.css`)).text();
    expect(css).toContain(".job-row");
    expect(css).toContain(".settings-tabs");
    expect(css).toContain(".attach-plus");
    expect(css).toContain(".provider-card");
    expect(css).toContain(".model-picker");
    expect(css).toContain(".model-picker-group");
    expect(css).toContain(".model-picker-cats");
    expect(css).toContain("overflow: visibl");
    expect(js).toContain("model-picker-cat");
    expect(page).toContain("id=\"prov-recheck\"");
    expect(page).toContain("data-prov-custom");
    expect(js).toContain("fillImplPicker");
    expect(js).toContain("openRouterOnly");
    expect(js).toContain("row.type === \"held\"");
    expect(js).toContain("row.held?.text");
    expect(js).toContain("row.type === \"ignored\"");
    expect(js).toContain("row.ignored?.text");
    expect(js).toContain("harness:");
    expect(js).toContain("model-picker");
    expect(js).toContain("pickerGroups");
    expect(js).toContain("placePickerMenu");
    expect(js).toContain("/api/mcp");
  } finally {
    server.stop(true);
  }
});

test("GET/PUT /api/mcp roundtrips servers without writing config.json", async () => {
  const { server, url, cwd } = await setup();
  try {
    const empty = await (await fetch(`${url}/api/mcp`)).json();
    expect(empty.servers).toEqual([]);
    const put = await fetch(`${url}/api/mcp`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        servers: [{ name: "echo", enabled: true, command: "bun", args: ["x"], env: { A: "1" } }],
      }),
    });
    expect(put.ok).toBe(true);
    const saved = await put.json();
    expect(saved.servers[0]?.name).toBe("echo");
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.mcp.servers[0]?.command).toBe("bun");
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(cwd, ".crew", "mcp.json"))).toBe(true);
    expect(readFileSync(join(cwd, ".crew", "config.json"), "utf8")).not.toContain("echo");
  } finally {
    server.stop(true);
  }
});

test("always rules add and delete one via /api/permissions", async () => {
  const { server, url, cwd } = await setup();
  try {
    const add = await fetch(`${url}/api/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "apply_patch", path: "src/a.ts" }),
    });
    expect(add.status).toBe(200);
    const listed = await add.json();
    expect(listed.rules).toHaveLength(1);
    expect(listed.rules[0].tool).toBe("apply_patch");
    expect(listed.rules[0].key).toContain("src/a.ts");
    await fetch(`${url}/api/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "shell", command: "npm test" }),
    });
    const key = listed.rules[0].key;
    const del = await fetch(
      `${url}/api/permissions?tool=apply_patch&key=${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
    expect(del.status).toBe(200);
    const after = await del.json();
    expect(after.rules).toHaveLength(1);
    expect(after.rules[0].tool).toBe("shell");
    const disk = JSON.parse(await Bun.file(join(cwd, ".crew", "permissions.json")).text());
    expect(disk.rules).toHaveLength(1);
  } finally {
    server.stop(true);
  }
});

test("GET/PUT /api/providers roundtrips without writing config.json", async () => {
  const { server, url, cwd } = await setup();
  try {
    const missing = await (await fetch(`${url}/api/providers`)).json();
    expect(missing.openrouter.enabled).toBe(true);
    expect(missing.claude.enabled).toBe(false);
    const put = await fetch(`${url}/api/providers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openrouter: { enabled: true },
        claude: { enabled: true },
        codex: { enabled: false },
        grok: { enabled: true, binary: "" },
        opencode: { enabled: false },
      }),
    });
    expect(put.status).toBe(200);
    const saved = await put.json();
    expect(saved.claude.enabled).toBe(true);
    expect(saved.grok.enabled).toBe(true);
    const got = await (await fetch(`${url}/api/providers`)).json();
    expect(got.claude.enabled).toBe(true);
    expect(existsSync(join(cwd, ".crew", "providers.json"))).toBe(true);
    await fetch(`${url}/api/allowed-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["z-ai/glm-5.3-flash"] }),
    });
    const still = JSON.parse(await Bun.file(join(cwd, ".crew", "providers.json")).text());
    expect(still.claude.enabled).toBe(true);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.defaultPermissionMode).toBe("auto-accept");
    expect(boot.autoCompact).toBe(true);
    expect(typeof boot.cwd).toBe("string");
    expect(boot.providers.claude.enabled).toBe(true);
    const health = await (await fetch(`${url}/api/providers/health`)).json();
    expect(Array.isArray(health.cards)).toBe(true);
    expect(health.cards.some((c: { id: string }) => c.id === "codex")).toBe(true);
    const models = await (await fetch(`${url}/api/providers/models`)).json();
    expect(Array.isArray(models.openrouter)).toBe(true);
    expect(Array.isArray(models.claude)).toBe(true);
    expect(Array.isArray(models.grok)).toBe(true);
  } finally {
    server.stop(true);
  }
});
