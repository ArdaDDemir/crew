import { expect, test } from "bun:test";
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
  return { server, url };
}

test("bootstrap lists channels and health is ok", async () => {
  const { server, url } = await setup();
  try {
    const health = await (await fetch(`${url}/api/health`)).json();
    expect(health.ok).toBe(true);
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.channels[0].id).toBe("landing");
    expect(boot.bots.map((b: { id: string }) => b.id)).toContain("coder");
    expect(Array.isArray(boot.models)).toBe(true);
    const page = await fetch(`${url}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Crew");
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
      body: JSON.stringify({ name: "Frontend", icon: "λ", soul: "Write HTML." }),
    });
    expect(bot.ok).toBe(true);
    const coder = await (await fetch(`${url}/api/bot/coder`)).json();
    expect(coder.name).toBe("Frontend");
    expect(coder.soul).toContain("Write HTML");
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
