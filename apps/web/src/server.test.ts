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
