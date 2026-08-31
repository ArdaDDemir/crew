import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsWorkspace } from "./fs-workspace";

async function tmpCrew() {
  const dir = await mkdtemp(join(tmpdir(), "crew-ws-"));
  return { dir, ws: new FsWorkspace(dir) };
}

test("bot create writes soul and round-trips", async () => {
  const { dir, ws } = await tmpCrew();
  ws.addBot({ id: "lead", name: "Lead" });
  expect(ws.getBot("lead")).toMatchObject({ id: "lead", name: "Lead" });
  const soul = await readFile(join(dir, "bots", "lead", "SOUL.md"), "utf8");
  expect(soul.length).toBeGreaterThan(0);
});

test("channel create persists members, lead, auto-accept, rules and context", async () => {
  const { dir, ws } = await tmpCrew();
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addBot({ id: "designer", name: "Designer" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "designer"],
    permissionMode: "auto-accept",
  });
  expect(ws.getChannel("landing")).toMatchObject({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "designer"],
    permissionMode: "auto-accept",
  });
  await readFile(join(dir, "channels", "landing", "RULES.md"), "utf8");
  await readFile(join(dir, "channels", "landing", "CONTEXT.md"), "utf8");
});

test("channel create fails if a member bot is missing", async () => {
  const { ws } = await tmpCrew();
  ws.addBot({ id: "lead", name: "Lead" });
  expect(() =>
    ws.addChannel({
      id: "landing",
      leadBotId: "lead",
      memberBotIds: ["lead", "ghost"],
      permissionMode: "auto-accept",
    }),
  ).toThrow("unknown bot: ghost");
});

test("updateChannel and updateBot persist icon name soul and folders", async () => {
  const { dir, ws } = await tmpCrew();
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addBot({ id: "coder", name: "Coder" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  ws.updateChannel("landing", {
    title: "Landing page",
    icon: "⌂",
    folders: ["."],
    context: "Marketing site.",
  });
  expect(ws.getChannel("landing")).toMatchObject({
    title: "Landing page",
    icon: "⌂",
    folders: ["."],
    context: "Marketing site.",
  });
  ws.updateBot("coder", {
    name: "Frontend",
    icon: "λ",
    soul: "Write HTML.",
    model: "anthropic/claude-sonnet-4",
    fallbackModel: "z-ai/glm-5.3-flash",
    titleModel: "z-ai/glm-5.3-flash",
    harness: "claude",
  });
  expect(ws.getBot("coder")).toMatchObject({
    name: "Frontend",
    icon: "λ",
    soul: "Write HTML.",
    model: "anthropic/claude-sonnet-4",
    fallbackModel: "z-ai/glm-5.3-flash",
    titleModel: "z-ai/glm-5.3-flash",
    harness: "claude",
  });
  ws.updateBot("coder", { harness: null });
  expect(ws.getBot("coder")?.harness ?? null).toBe(null);
  ws.addSkill("coder", { name: "html", description: "Semantic HTML", body: "Use sections." });
  expect(ws.getBot("coder")?.skills?.some((s) => s.name === "html")).toBe(true);
  expect(ws.getSkill("coder", "html")?.body).toContain("Use sections.");
  expect(() => ws.addBot({ id: "coder", name: "Dup" })).toThrow("bot exists");
  const md = await readFile(join(dir, "bots", "coder", "skills", "html", "SKILL.md"), "utf8");
  expect(md.startsWith("---")).toBe(true);
  expect(md).toContain("name: html");
  ws.removeSkill("coder", "html");
  expect(ws.getSkill("coder", "html")).toBeUndefined();
});

test("updateChannel with undefined memberBotIds keeps the roster", async () => {
  const { ws } = await tmpCrew();
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addBot({ id: "coder", name: "Coder" });
  ws.addChannel({
    id: "lab",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  ws.updateChannel("lab", { title: "Lab room", memberBotIds: undefined });
  expect(ws.getChannel("lab")?.memberBotIds).toEqual(["lead", "coder"]);
  ws.removeBot("coder");
  expect(ws.getBot("coder")).toBeUndefined();
  expect(ws.getChannel("lab")?.memberBotIds).toEqual(["lead"]);
});

test("removeBot drops membership and leaves logs alone", async () => {
  const { dir, ws } = await tmpCrew();
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addBot({ id: "coder", name: "Coder" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  ws.removeBot("coder");
  expect(ws.getBot("coder")).toBeUndefined();
  expect(ws.getChannel("landing")?.memberBotIds).toEqual(["lead"]);
  expect(() => ws.removeBot("ghost")).toThrow("unknown bot: ghost");
  const { existsSync } = await import("node:fs");
  expect(existsSync(join(dir, "bots", "coder"))).toBe(false);
});

test("removeChannel deletes the channel dir only", async () => {
  const { dir, ws } = await tmpCrew();
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  ws.removeChannel("landing");
  expect(ws.getChannel("landing")).toBeUndefined();
  expect(() => ws.removeChannel("ghost")).toThrow("unknown channel: ghost");
  const { existsSync } = await import("node:fs");
  expect(existsSync(join(dir, "channels", "landing"))).toBe(false);
});

test("rejects invalid bot slug", async () => {
  const { ws } = await tmpCrew();
  expect(() => ws.addBot({ id: "Lead", name: "X" })).toThrow("invalid slug: Lead");
});

test("bot effort persists to bot.json", async () => {
  const { dir, ws } = await tmpCrew();
  ws.addBot({ id: "coder", name: "Coder", effort: "high" });
  expect(ws.getBot("coder")?.effort).toBe("high");
  ws.updateBot("coder", { effort: "low" });
  const raw = JSON.parse(
    await readFile(join(dir, "bots", "coder", "bot.json"), "utf8"),
  ) as { effort?: string };
  expect(raw.effort).toBe("low");
});
