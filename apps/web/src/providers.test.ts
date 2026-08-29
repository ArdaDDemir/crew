import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptedProvider } from "@crew/core";
import { createHost } from "./host";
import {
  defaultProviders,
  healthProviders,
  listAllProviderModels,
  loadProviders,
  listProviderCards,
  probeHarness,
  parseCodexModelCache,
  parseHarnessModelList,
  saveProviders,
  whichBinary,
} from "./providers";

test("whichBinary finds native Claude in ~/.local/bin even when PATH is empty", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-home-"));
  mkdirSync(join(cwd, ".local", "bin"), { recursive: true });
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  const fake = join(cwd, ".local", "bin", name);
  writeFileSync(fake, "fake");
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  const prevPath = process.env.PATH;
  process.env.HOME = cwd;
  process.env.USERPROFILE = cwd;
  process.env.PATH = join(cwd, "no-path");
  try {
    expect(whichBinary("claude")).toBe(fake);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
    process.env.PATH = prevPath;
  }
});

test("listProviderCards probes PATH even when the harness is off", async () => {
  const bun = Bun.which("bun");
  expect(bun).toBeTruthy();
  const cwd = await mkdtemp(join(tmpdir(), "crew-prov-"));
  createHost({ cwd, provider: new ScriptedProvider([]) });
  saveProviders(cwd, {
    ...defaultProviders(),
    grok: { enabled: false, binary: bun! },
  });
  const grok = listProviderCards(cwd).find((c) => c.id === "grok");
  expect(grok?.installed).toBe(true);
  expect(grok?.enabled).toBe(false);
  expect(grok?.status).toBe("installed");
  expect(grok?.which).toBe(bun);
});

test("probeHarness --version fills version; missing binary is not installed", async () => {
  const bun = Bun.which("bun");
  const ok = await probeHarness("codex", bun!);
  expect(ok.installed).toBe(true);
  expect(ok.version).toBeTruthy();
  const miss = await probeHarness("claude", join(tmpdir(), "no-such-claude.exe"));
  expect(miss.installed).toBe(false);
  expect(miss.status).toBe("missing");
});

test("customModels persist and prepend the harness catalog", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-prov-"));
  createHost({ cwd, provider: new ScriptedProvider([]) });
  saveProviders(cwd, {
    ...defaultProviders(),
    claude: { enabled: true, binary: "", customModels: ["claude-opus-4-7", " sonnet "] },
  });
  const loaded = loadProviders(cwd);
  expect(loaded.claude.customModels).toEqual(["claude-opus-4-7", "sonnet"]);
  const catalog = await listAllProviderModels(cwd, []);
  expect(catalog.claude[0]?.id).toBe("claude-opus-4-7");
  expect(catalog.claude.map((m) => m.id)).toContain("sonnet");
});

test("parseCodexModelCache keeps listed models and skips hidden", () => {
  const rows = parseCodexModelCache(
    JSON.stringify({
      models: [
        { slug: "gpt-5.6-sol", display_name: "GPT-5.6-Sol", visibility: "list" },
        { slug: "gpt-5.6-terra", display_name: "GPT-5.6-Terra", visibility: "list" },
        { slug: "gpt-reserve", display_name: "GPT-Reserve", visibility: "hide" },
      ],
    }),
  );
  expect(rows.map((m) => m.id)).toEqual(["gpt-5.6-sol", "gpt-5.6-terra"]);
  expect(rows[0]?.label).toBe("GPT-5.6-Sol");
});

test("parseHarnessModelList reads grok and opencode CLI output", () => {
  const grok = parseHarnessModelList(
    "grok",
    "Default model: grok-4.6\n\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5\n",
  );
  expect(grok.map((m) => m.id)).toEqual(["grok-4.6", "grok-4.5"]);
  const oc = parseHarnessModelList("opencode", "opencode/big-pickle\nopenrouter/~openai/gpt-latest\n");
  expect(oc[0]).toEqual({ id: "opencode/big-pickle", label: "big-pickle" });
  expect(oc[1]?.id).toBe("openrouter/~openai/gpt-latest");
});

test("healthProviders marks enabled+installed as ready", async () => {
  const bun = Bun.which("bun");
  const cwd = await mkdtemp(join(tmpdir(), "crew-prov-"));
  createHost({ cwd, provider: new ScriptedProvider([]) });
  saveProviders(cwd, {
    ...defaultProviders(),
    claude: { enabled: true, binary: bun! },
  });
  const cards = await healthProviders(cwd);
  const claude = cards.find((c) => c.id === "claude");
  expect(claude?.status).toBe("ready");
  expect(claude?.installed).toBe(true);
  expect(claude?.login).toBe("claude auth login");
});
