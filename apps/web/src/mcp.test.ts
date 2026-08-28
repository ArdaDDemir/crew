import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultMcp, loadMcp, parseMcpBody, saveMcp } from "./mcp";

test("missing mcp.json is empty servers", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-mcp-"));
  expect(loadMcp(cwd)).toEqual({ servers: [] });
  expect(existsSync(join(cwd, ".crew", "mcp.json"))).toBe(false);
});

test("saveMcp roundtrips and is not config.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-mcp-"));
  const saved = saveMcp(cwd, {
    servers: [
      {
        name: "echo",
        enabled: true,
        command: "bun",
        args: ["run", "echo.ts"],
        env: { FOO: "1" },
      },
    ],
  });
  expect(saved.servers[0]?.name).toBe("echo");
  expect(loadMcp(cwd)).toEqual(saved);
  expect(readFileSync(join(cwd, ".crew", "mcp.json"), "utf8")).toContain("echo");
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);
});

test("parseMcpBody drops bad names and caps at 8", () => {
  const body = {
    servers: [
      { name: "OK", command: "npx", args: ["-y", "pkg"] },
      { name: "bad name", command: "npx" },
      { name: "dup", command: "a" },
      { name: "dup", command: "b" },
      ...Array.from({ length: 10 }, (_, i) => ({ name: `s${i}`, command: "x" })),
    ],
  };
  const parsed = parseMcpBody(body);
  expect(parsed.servers.every((s) => /^[a-z0-9-]+$/.test(s.name))).toBe(true);
  expect(parsed.servers.filter((s) => s.name === "dup")).toHaveLength(1);
  expect(parsed.servers.length).toBeLessThanOrEqual(8);
  expect(defaultMcp()).toEqual({ servers: [] });
});

test("parseMcpBody keeps HTTP url servers without a command", () => {
  const parsed = parseMcpBody({
    servers: [{ name: "remote", url: "http://127.0.0.1:9/mcp", env: { TOKEN: "x" } }],
  });
  expect(parsed.servers[0]?.url).toBe("http://127.0.0.1:9/mcp");
  expect(parsed.servers[0]?.command).toBe("");
  expect(parsed.servers[0]?.env.TOKEN).toBe("x");
});
