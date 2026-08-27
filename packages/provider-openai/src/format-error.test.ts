import { expect, test } from "bun:test";
import { formatProviderError, isRateLimitError } from "./format-error";

const openRouter429 = JSON.stringify({
  error: {
    message: "Provider returned error",
    code: 429,
    metadata: {
      raw: "google/gemma-4-31b-it:free is temporarily rate-limited upstream.",
      provider_name: "Google AI Studio",
    },
  },
  user_id: "user_secret",
});

test("429 becomes a short message without user_id or raw JSON", () => {
  const msg = formatProviderError(429, openRouter429);
  expect(msg).toContain("429 rate-limited");
  expect(msg).toContain("Google AI Studio");
  expect(msg).not.toContain("user_secret");
  expect(msg).not.toContain("user_id");
  expect(msg).not.toContain("{");
});

test("isRateLimitError matches formatted and raw 429", () => {
  expect(isRateLimitError("429 rate-limited via Google")).toBe(true);
  expect(isRateLimitError("provider 401: nope")).toBe(false);
});
