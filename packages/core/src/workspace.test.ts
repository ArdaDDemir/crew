import { expect, test } from "bun:test";
import { MemoryWorkspace } from "./workspace";

test("updateChannel ignores undefined patch keys so removeBot still works", () => {
  const ws = new MemoryWorkspace();
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addBot({ id: "coder", name: "Coder" });
  ws.addChannel({
    id: "lab",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  ws.updateChannel("lab", { title: "Lab", memberBotIds: undefined });
  expect(ws.getChannel("lab")?.memberBotIds).toEqual(["lead", "coder"]);
  ws.removeBot("coder");
  expect(ws.getBot("coder")).toBeUndefined();
  expect(ws.getChannel("lab")?.memberBotIds).toEqual(["lead"]);
});
