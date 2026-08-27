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
  const { ws } = await tmpCrew();
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
  ws.updateBot("coder", { name: "Frontend", icon: "λ", soul: "Write HTML." });
  expect(ws.getBot("coder")).toMatchObject({
    name: "Frontend",
    icon: "λ",
    soul: "Write HTML.",
  });
  ws.addSkill("coder", { name: "html", description: "Semantic HTML", body: "Use sections." });
  expect(ws.getBot("coder")?.skills?.some((s) => s.name === "html")).toBe(true);
});

test("rejects invalid bot slug", async () => {
  const { ws } = await tmpCrew();
  expect(() => ws.addBot({ id: "Lead", name: "X" })).toThrow("invalid slug: Lead");
});
