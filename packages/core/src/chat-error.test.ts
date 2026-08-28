import { expect, test } from "bun:test";
import { shortenChatError } from "./chat-error";

const raw429 =
  'provider 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"raw":"z-ai/glm-5.2:free is temporarily rate-limited upstream.","provider_name":"Decart"},"user_id":"user_secret"}}';

test("stored 429 JSON becomes a short line without user_id", () => {
  const msg = shortenChatError(raw429);
  expect(msg).toContain("429");
  expect(msg).toContain("Decart");
  expect(msg.toLowerCase()).toContain("rate");
  expect(msg).not.toContain("user_secret");
  expect(msg).not.toContain("{");
  expect(msg.length).toBeLessThan(180);
});

test("plain account text is unchanged", () => {
  expect(shortenChatError("I wrote index.html")).toBe("I wrote index.html");
});
