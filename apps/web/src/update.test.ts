import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_UPDATE_FEED,
  asUpdateUrl,
  buildReleaseManifest,
  buildUpdaterManifest,
  changelogNotesForVersion,
  checkCrewUpdate,
  cmpCrewVersion,
  effectiveUpdateFeed,
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

test("parseUpdateManifest reads the GitHub Releases API shape and prefers NSIS", () => {
  const got = parseUpdateManifest({
    tag_name: "v0.11.0",
    name: "0.11.0",
    body: "- signed updater",
    assets: [
      { name: "latest.json", browser_download_url: "https://example.com/latest.json" },
      { name: "Crew_0.11.0_x64_en-US.msi", browser_download_url: "https://example.com/Crew.msi" },
      { name: "Crew_0.11.0_x64-setup.exe", browser_download_url: "https://example.com/Crew-setup.exe" },
      { name: "Crew-0.11.0-windows-portable.zip", browser_download_url: "https://example.com/portable.zip" },
    ],
  });
  expect(got).toEqual({
    version: "0.11.0",
    notes: "- signed updater",
    url: "https://example.com/Crew-setup.exe",
  });
});

test("parseUpdateManifest falls back to msi then portable then first asset", () => {
  const msi = parseUpdateManifest({
    tag_name: "v0.11.0",
    assets: [
      { name: "a.txt", browser_download_url: "https://example.com/a.txt" },
      { name: "Crew.msi", browser_download_url: "https://example.com/Crew.msi" },
    ],
  });
  expect(msi?.url).toBe("https://example.com/Crew.msi");
  const zip = parseUpdateManifest({
    tag_name: "v0.11.0",
    assets: [
      { name: "a.txt", browser_download_url: "https://example.com/a.txt" },
      { name: "Crew-portable.zip", browser_download_url: "https://example.com/p.zip" },
    ],
  });
  expect(zip?.url).toBe("https://example.com/p.zip");
});

test("effectiveUpdateFeed: custom url wins, empty + auto uses GitHub, opt-out disables", () => {
  expect(effectiveUpdateFeed(true, "https://example.com/latest.json")).toBe("https://example.com/latest.json");
  expect(effectiveUpdateFeed(undefined, "")).toBe(DEFAULT_UPDATE_FEED);
  expect(effectiveUpdateFeed(true, "")).toBe(DEFAULT_UPDATE_FEED);
  expect(effectiveUpdateFeed(false, "")).toBe("");
});

test("checkCrewUpdate reads the GitHub feed", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        tag_name: "v0.11.0",
        body: "notes",
        assets: [{ name: "Crew_0.11.0_x64-setup.exe", browser_download_url: "https://example.com/setup.exe" }],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  expect(
    await checkCrewUpdate({ current: "0.10.0", updateUrl: DEFAULT_UPDATE_FEED, fetchImpl }),
  ).toEqual({ status: "available", version: "0.11.0", notes: "notes", url: "https://example.com/setup.exe" });
});

test("buildUpdaterManifest embeds the signature with an absolute GitHub url", () => {
  const got = buildUpdaterManifest({
    version: "0.11.0",
    notes: "signed",
    signature: "SIGDATA",
    repo: "ArdaDDemir/crew",
  });
  expect(got.version).toBe("0.11.0");
  expect(got.platforms["windows-x86_64"].signature).toBe("SIGDATA");
  expect(got.platforms["windows-x86_64"].url).toBe(
    "https://github.com/ArdaDDemir/crew/releases/download/v0.11.0/Crew_0.11.0_x64-setup.exe",
  );
  expect(typeof got.pub_date).toBe("string");
});
