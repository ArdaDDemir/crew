import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crewToolsFromMcp, fakeMcpRpc, httpMcpRpc, openMcpSession, spawnMcpStdio } from "./mcp-client";

test("fake MCP session lists and calls echo", async () => {
  const rpc = fakeMcpRpc({
    tools: [
      {
        name: "echo",
        description: "Echo text",
        inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      },
    ],
    call: async (name, args) => ({ content: [{ type: "text", text: `${name}:${String(args.text ?? "")}` }] }),
  });
  const session = await openMcpSession("echo", rpc);
  expect(session.tools[0]?.name).toBe("mcp_echo_echo");
  expect(session.tools[0]?.description).toContain("Echo text");
  const out = await session.tools[0]!.execute({ text: "hi" }, { workspaceRoot: "/proj" });
  expect(out).toBe("echo:hi");
  await session.close();
});

test("crewToolsFromMcp prefixes server and slugs dots", () => {
  const call = async () => ({ content: [{ type: "text", text: "ok" }] });
  const tools = crewToolsFromMcp(
    "fs",
    [
      { name: "read_file", description: "Read", inputSchema: { type: "object", properties: {} } },
      { name: "dir.list", description: "List", inputSchema: { type: "object", properties: {} } },
    ],
    call,
  );
  expect(tools.map((t) => t.name)).toEqual(["mcp_fs_read_file", "mcp_fs_dir_list"]);
});

test("http MCP initialize tools/list", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const body = (await req.json()) as { id?: number; method?: string };
      if (body.method === "initialize") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "h" } },
        });
      }
      if (body.method === "tools/list") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: [{ name: "ping", description: "p", inputSchema: { type: "object", properties: {} } }] },
        });
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result: {} });
    },
  });
  try {
    const rpc = httpMcpRpc(server.url);
    const session = await openMcpSession("h", rpc);
    expect(session.tools.map((t) => t.name)).toEqual(["mcp_h_ping"]);
    await session.close();
  } finally {
    server.stop(true);
  }
});

test("stdio MCP initialize tools/list tools/call", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-mcp-stdio-"));
  const script = join(import.meta.dir, "mcp-echo-server.ts");
  const rpc = spawnMcpStdio(
    { name: "echo", enabled: true, command: process.execPath, args: [script], env: {} },
    { cwd },
  );
  try {
    const session = await openMcpSession("echo", rpc);
    expect(session.tools.map((t) => t.name)).toEqual(["mcp_echo_ping"]);
    expect(await session.tools[0]!.execute({}, { workspaceRoot: cwd })).toBe("pong");
    await session.close();
  } finally {
    await rpc.close();
  }
});
