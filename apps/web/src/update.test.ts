import { expect, test } from "bun:test";
import { asUpdateUrl, checkCrewUpdate, cmpCrewVersion, parseUpdateManifest } from "./update";

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
