import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeConfig, maskKey, writeConfigFile, userConfigPath } from "./config";

test("env overrides user config; project overrides user model", async () => {
  const home = await mkdtemp(join(tmpdir(), "crew-home-"));
  const cwd = await mkdtemp(join(tmpdir(), "crew-cwd-"));
  writeConfigFile(userConfigPath(home), {
    apiKey: "user-key",
    model: "openai/gpt-4o-mini",
  });
  writeConfigFile(join(cwd, ".crew", "config.json"), {
    model: "z-ai/glm-5.2:free",
  });
  const merged = mergeConfig({
    cwd,
    home,
    env: { OPENROUTER_API_KEY: "env-key" },
  });
  expect(merged.apiKey).toBe("env-key");
  expect(merged.model).toBe("z-ai/glm-5.2:free");
});

test("maskKey hides the middle", () => {
  expect(maskKey("sk-or-1234567890abcd")).toBe("sk-o…abcd");
  expect(maskKey(undefined)).toBe("(not set)");
});
