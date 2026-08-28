import { expect, test } from "bun:test";
import { MemoryWorkspace } from "./workspace";
import { orgNeedsAsk, runOrgTool } from "./org";

function crew() {
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addBot({
    id: "coder",
    name: "Coder",
    skills: [{ name: "html", description: "Semantic HTML", body: "Use sections." }],
  });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  return workspace;
}

test("supervised asks before spawning rooms or people", () => {
  expect(orgNeedsAsk("supervised", "bot_create")).toBe(true);
  expect(orgNeedsAsk("auto-accept", "bot_create")).toBe(false);
  expect(orgNeedsAsk("supervised", "self_update")).toBe(false);
});

test("bot_create adds a member to the current channel", () => {
  const workspace = crew();
  const out = runOrgTool(
    "bot_create",
    { id: "researcher", name: "Researcher", soul: "You look things up." },
    { workspace, botId: "lead", channelId: "landing" },
  );
  expect(out).toContain("@researcher");
  expect(workspace.getBot("researcher")?.name).toBe("Researcher");
  expect(workspace.getChannel("landing")?.memberBotIds).toContain("researcher");
});

test("bot_create rejects reserved and duplicate ids", () => {
  const workspace = crew();
  expect(() =>
    runOrgTool("bot_create", { id: "human", name: "H" }, { workspace, botId: "lead", channelId: "landing" }),
  ).toThrow("reserved");
  expect(() =>
    runOrgTool("bot_create", { id: "coder", name: "C" }, { workspace, botId: "lead", channelId: "landing" }),
  ).toThrow("bot exists");
});

test("skill_acquire copies an existing skill onto another bot", () => {
  const workspace = crew();
  const out = runOrgTool(
    "skill_acquire",
    { name: "html", target: "lead" },
    { workspace, botId: "lead", channelId: "landing" },
  );
  expect(out).toContain("copied");
  expect(workspace.getSkill("lead", "html")?.body).toContain("Use sections.");
});

test("skill_acquire will not invent a skill onto someone else", () => {
  const workspace = crew();
  expect(() =>
    runOrgTool(
      "skill_acquire",
      { name: "seo", target: "coder", description: "SEO", body: "do seo" },
      { workspace, botId: "lead", channelId: "landing" },
    ),
  ).toThrow("must research");
});

test("skill_acquire writes a new skill only onto self", () => {
  const workspace = crew();
  const out = runOrgTool(
    "skill_acquire",
    { name: "seo", description: "Search", body: "Write titles first." },
    { workspace, botId: "coder", channelId: "landing" },
  );
  expect(out).toContain("wrote skill");
  expect(workspace.getSkill("coder", "seo")?.body).toContain("titles");
});

test("self_update cannot be used as a disguise for another bot", () => {
  const workspace = crew();
  runOrgTool("self_update", { soul: "I ship HTML." }, { workspace, botId: "coder" });
  expect(workspace.getBot("coder")?.soul).toBe("I ship HTML.");
  expect(workspace.getBot("lead")?.soul ?? "").not.toContain("I ship HTML.");
});

test("channel_create includes creator and validates members", () => {
  const workspace = crew();
  const out = runOrgTool(
    "channel_create",
    { id: "research", members: "coder", title: "Research" },
    { workspace, botId: "lead", channelId: "landing" },
  );
  expect(out).toContain("#research");
  const ch = workspace.getChannel("research");
  expect(ch?.leadBotId).toBe("lead");
  expect(ch?.memberBotIds.sort()).toEqual(["coder", "lead"]);
  expect(() =>
    runOrgTool("channel_create", { id: "ghost", members: "nope" }, { workspace, botId: "lead" }),
  ).toThrow("unknown bot: nope");
});
