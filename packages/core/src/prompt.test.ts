import { expect, test } from "bun:test";
import { MemoryWorkspace } from "./workspace";
import { buildHistory, buildSystemPrompt } from "./prompt";

function crew() {
  const workspace = new MemoryWorkspace();
  workspace.addBot({
    id: "lead",
    name: "Lead",
    soul: "Distribute work. Do not write code.",
    model: "z-ai/glm-5.3-flash",
  });
  workspace.addBot({
    id: "designer",
    name: "Designer",
    soul: "Write copy and layout.",
    model: "z-ai/glm-5.3-flash",
  });
  workspace.addBot({ id: "coder", name: "Coder", soul: "Write HTML/CSS/JS." });
  workspace.addBot({ id: "tester", name: "Tester", soul: "Break things." });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "designer", "coder", "tester"],
    permissionMode: "auto-accept",
    rules: "No @ means wait.",
    context: "Marketing landing page.",
  });
  return workspace;
}

test("channel prompt names the self, roster, lead, rules, and tools", () => {
  const text = buildSystemPrompt({
    workspace: crew(),
    botId: "designer",
    thread: { kind: "channel", id: "landing" },
    toolNames: ["read", "apply_patch", "shell"],
  });
  expect(text).toContain("id: designer");
  expect(text).toContain("You are Designer");
  expect(text).toContain("@lead");
  expect(text).toContain("@coder");
  expect(text).toContain("@tester");
  expect(text).toContain("lead of this channel: @lead");
  expect(text).toContain("No @ means wait.");
  expect(text).toContain("Marketing landing page.");
  expect(text).toContain("apply_patch");
  expect(text).toContain("give an account");
  expect(text).toContain("first person");
  expect(text).toContain("at your desk");
  expect(text).toContain("If something is missing, ask");
  expect(text).toContain("If it didn't work");
  expect(text).toContain("Don't fake success");
  expect(text).toContain("The team only sees your account");
  expect(text).not.toContain('post "done:');
  expect(text).toContain("Write copy and layout.");
  expect(text).toContain("mention = wake");
  expect(text).toContain("Other bots may run at the same time");
  expect(text).not.toContain("You are Lead");
});

test("history treats other bots as user lines, self as assistant", () => {
  const events = [
    {
      v: 1 as const,
      id: "1",
      ts: "t",
      thread: { kind: "channel" as const, id: "landing" },
      type: "message.posted",
      parent: null,
      payload: { author: { kind: "human" }, text: "go" },
    },
    {
      v: 1 as const,
      id: "2",
      ts: "t",
      thread: { kind: "channel" as const, id: "landing" },
      type: "message.posted",
      parent: null,
      payload: { author: { kind: "bot", botId: "lead" }, text: "plan: ..." },
    },
    {
      v: 1 as const,
      id: "3",
      ts: "t",
      thread: { kind: "channel" as const, id: "landing" },
      type: "message.posted",
      parent: null,
      payload: { author: { kind: "bot", botId: "coder" }, text: "html ready" },
    },
  ];
  const hist = buildHistory(events, "coder");
  expect(hist[0]).toEqual({ role: "user", content: "human: go" });
  expect(hist[1]).toEqual({ role: "user", content: "@lead: plan: ..." });
  expect(hist[2]).toEqual({ role: "assistant", content: "html ready" });
});

test("DM prompt lists only the two parties", () => {
  const text = buildSystemPrompt({
    workspace: crew(),
    botId: "coder",
    thread: { kind: "dm", id: "human__coder" },
    toolNames: ["read"],
    dmParticipants: [{ kind: "human" }, { kind: "bot", botId: "coder" }],
  });
  expect(text).toContain("Private DM");
  expect(text).toContain("human");
  expect(text).toContain("@coder");
  expect(text).not.toContain("Marketing landing page.");
});
