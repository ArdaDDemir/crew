import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  asUpdateUrl,
  buildReleaseManifest,
  changelogNotesForVersion,
  checkCrewUpdate,
  cmpCrewVersion,
  parseUpdateManifest,
  writeReleaseManifest,
} from "./update";

test("cmpCrewVersion orders 0.x minors", () => {
  expect(cmpCrewVersion("0.4.0", "0.5.0")).toBe(-1);
  expect(cmpCrewVersion("0.5.0", "0.4.0")).toBe(1);
  expect(cmpCrewVersion("v0.5.0", "0.5.0")).toBe(0);
});

test("asUpdateUrl allows https and loopback http only", () => {
  expect(asUpdateUrl("https://example.com/latest.json")).toBe("https://example.com/latest.json");
  expect(asUpdateUrl("http://127.0.0.1:9/latest.json")).toContain("127.0.0.1");
  expect(asUpdateUrl("http://evil.example/latest.json")).toBe("");
  expect(asUpdateUrl("ftp://x")).toBe("");
  expect(asUpdateUrl("")).toBe("");
});

test("parseUpdateManifest reads version notes url", () => {
  expect(
    parseUpdateManifest({ version: "0.5.0", notes: "tray", url: "https://example.com/Crew.msi" }),
  ).toEqual({ version: "0.5.0", notes: "tray", url: "https://example.com/Crew.msi" });
});

test("parseUpdateManifest reads Tauri platforms windows url", () => {
  const got = parseUpdateManifest({
    version: "0.5.0",
    notes: "msi",
    platforms: { "windows-x86_64": { url: "https://example.com/Crew.msi", signature: "x" } },
  });
  expect(got?.url).toBe("https://example.com/Crew.msi");
});

test("checkCrewUpdate is disabled without a url", async () => {
  expect(await checkCrewUpdate({ current: "0.4.0", updateUrl: "" })).toEqual({ status: "disabled" });
});

test("checkCrewUpdate reports available when manifest is newer", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({ version: "0.5.0", notes: "MSI", url: "https://example.com/Crew.msi" }),
      { headers: { "Content-Type": "application/json" } },
    );
  expect(await checkCrewUpdate({ current: "0.4.0", updateUrl: "https://example.com/latest.json", fetchImpl })).toEqual({
    status: "available",
    version: "0.5.0",
    notes: "MSI",
    url: "https://example.com/Crew.msi",
  });
});

test("parseUpdateManifest resolves relative url against the latest.json location", () => {
  const got = parseUpdateManifest(
    { version: "0.5.1", notes: "fix", url: "Crew_0.5.1_x64_en-US.msi" },
    "https://example.com/crew/latest.json",
  );
  expect(got?.url).toBe("https://example.com/crew/Crew_0.5.1_x64_en-US.msi");
});

test("buildReleaseManifest prefers the MSI filename and can prefix a release base", () => {
  expect(
    buildReleaseManifest({
      version: "0.5.0",
      notes: "tray",
      msi: "Crew_0.5.0_x64_en-US.msi",
      nsis: "Crew_0.5.0_x64-setup.exe",
    }).url,
  ).toBe("Crew_0.5.0_x64_en-US.msi");
  expect(
    buildReleaseManifest({
      version: "0.5.0",
      notes: "tray",
      msi: "Crew.msi",
      baseUrl: "https://github.com/a/b/releases/download/v0.5.0",
    }).url,
  ).toBe("https://github.com/a/b/releases/download/v0.5.0/Crew.msi");
});

test("changelogNotesForVersion reads Added bullets for that version", () => {
  const md = `# Changelog\n\n## [Unreleased]\n\n## [0.5.0] - 2026-08-28\n\n### Added\n\n- **Tray** hides the window.\n- **MSI** installer.\n\n## [0.4.0] - 2026-08-28\n\n- old\n`;
  expect(changelogNotesForVersion(md, "0.5.0")).toContain("Tray");
  expect(changelogNotesForVersion(md, "0.5.0")).not.toContain("old");
});

test("writeReleaseManifest writes dist/latest.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-latest-"));
  const path = writeReleaseManifest(dir, {
    version: "0.5.0",
    notes: "tray",
    msi: "Crew_0.5.0_x64_en-US.msi",
  });
  expect(path).toBe(join(dir, "latest.json"));
  const body = JSON.parse(readFileSync(path, "utf8")) as { version: string; url: string };
  expect(body.version).toBe("0.5.0");
  expect(body.url).toBe("Crew_0.5.0_x64_en-US.msi");
});

test("checkCrewUpdate reports current when versions match", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ version: "0.4.0", url: "https://example.com/Crew.msi" }), {
      headers: { "Content-Type": "application/json" },
    });
  expect(await checkCrewUpdate({ current: "0.4.0", updateUrl: "https://example.com/latest.json", fetchImpl })).toEqual({
    status: "current",
    version: "0.4.0",
  });
});
