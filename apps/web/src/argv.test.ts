import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { ScriptedProvider } from "@crew/core";
import { FsWorkspace } from "@crew/workspace-fs";
import { flagsFromArgv, parseServerArgv, resolvePublicDir } from "./argv";
import { startServer } from "./server";

test("parseServerArgv reads cwd port public hostname", () => {
  const got = parseServerArgv([
    "--cwd",
    "D:\\proj",
    "--port",
    "7734",
    "--public",
    "D:\\public",
    "--hostname",
    "127.0.0.1",
  ]);
  expect(got).toEqual({
    cwd: "D:\\proj",
    port: 7734,
    publicDir: "D:\\public",
    hostname: "127.0.0.1",
  });
});

test("parseServerArgv throws on unknown dash flag", () => {
  expect(() => parseServerArgv(["--cwd", "x", "--oops"])).toThrow(/unknown flag: --oops/);
});

test("parseServerArgv throws on missing value", () => {
  expect(() => parseServerArgv(["--cwd"])).toThrow(/missing value for --cwd/);
});

test("parseServerArgv throws on non-loopback hostname", () => {
  expect(() => parseServerArgv(["--hostname", "0.0.0.0"])).toThrow(/127\.0\.0\.1/);
});

test("flagsFromArgv skips bun + script", () => {
  expect(
    flagsFromArgv(["C:\\bun.exe", "C:\\repo\\apps\\web\\src\\server.ts", "--cwd", "D:\\proj"]),
  ).toEqual(["--cwd", "D:\\proj"]);
});

test("flagsFromArgv skips compiled exe only", () => {
  expect(flagsFromArgv(["C:\\Crew\\crew-server.exe", "--cwd", "D:\\proj"])).toEqual([
    "--cwd",
    "D:\\proj",
  ]);
});

test("resolvePublicDir uses --public when set", () => {
  expect(
    resolvePublicDir({
      flag: "E:\\pub",
      execPath: "C:\\Crew\\crew-server.exe",
      importMetaDir: "C:\\repo\\apps\\web\\src",
    }),
  ).toBe("E:\\pub");
});

test("resolvePublicDir uses exe dir when importMetaDir is bunfs", () => {
  expect(
    resolvePublicDir({
      execPath: "C:\\Crew\\crew-server.exe",
      importMetaDir: "B:\\$bunfs\\root",
    }),
  ).toBe(join("C:\\Crew", "public"));
});

test("resolvePublicDir uses source public next to src", () => {
  expect(
    resolvePublicDir({
      execPath: "C:\\Users\\Arda\\.bun\\bin\\bun.exe",
      importMetaDir: "C:\\repo\\apps\\web\\src",
    }),
  ).toBe(join("C:\\repo\\apps\\web\\src", "..", "public"));
});

test("startServer bootstrap cwd is the opted folder", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-ui-cwd-"));
  const ws = new FsWorkspace(join(cwd, ".crew"));
  ws.addBot({ id: "lead", name: "Lead" });
  ws.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  writeFileSync(join(cwd, ".crew", "config.json"), `${JSON.stringify({ apiKey: "sk-test" })}\n`);
  const { server, url } = startServer({
    cwd,
    port: 0,
    publicDir: join(import.meta.dir, "..", "public"),
    provider: new ScriptedProvider([[{ type: "done" }]]),
  });
  try {
    const boot = await (await fetch(`${url}/api/bootstrap`)).json();
    expect(boot.cwd).toBe(cwd);
  } finally {
    server.stop(true);
  }
});
