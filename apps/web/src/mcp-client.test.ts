import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  crewToolsFromMcp,
  fakeMcpRpc,
  httpMcpRpc,
  openMcpSession,
  spawnMcpStdio,
  type McpRpc,
} from "./mcp-client";
import { CREW_VERSION } from "./version";

function scriptedRpc(handlers: Record<string, (params?: unknown) => unknown>): McpRpc {
  return {
    async request(method, params) {
      if (method === "initialize") {
        return (
          handlers.initialize?.(params) ?? {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "s" },
          }
        );
      }
      const fn = handlers[method];
      if (fn) return fn(params);
      return {};
    },
    notify() {},
    async close() {},
  };
}

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

test("initialize clientInfo version matches CREW_VERSION", async () => {
  let seen: { name?: string; version?: string } | undefined;
  const rpc = scriptedRpc({
    initialize: (params) => {
      const row = params as { clientInfo?: { name?: string; version?: string } };
      seen = row.clientInfo;
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "s" },
      };
    },
  });
  await openMcpSession("s", rpc);
  expect(seen?.name).toBe("crew");
  expect(seen?.version).toBe(CREW_VERSION);
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
    expect(session.tools.map((t) => t.name)).toContain("mcp_echo_ping");
    const ping = session.tools.find((t) => t.name === "mcp_echo_ping")!;
    expect(await ping.execute({}, { workspaceRoot: cwd })).toBe("pong");
    await session.close();
  } finally {
    await rpc.close();
  }
});

test("openMcpSession skips resources and prompts when capabilities omit them", async () => {
  const session = await openMcpSession(
    "echo",
    scriptedRpc({
      "tools/list": () => ({
        tools: [{ name: "ping", description: "p", inputSchema: { type: "object", properties: {} } }],
      }),
    }),
  );
  expect(session.tools.map((t) => t.name)).toEqual(["mcp_echo_ping"]);
  await session.close();
});

test("openMcpSession adds resources list/read when capabilities include resources", async () => {
  const reads: unknown[] = [];
  const session = await openMcpSession(
    "docs",
    scriptedRpc({
      initialize: () => ({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "docs" },
      }),
      "tools/list": () => ({ tools: [] }),
      "resources/list": () => ({
        resources: [{ uri: "crew://note", name: "note", mimeType: "text/plain" }],
      }),
      "resources/read": (params) => {
        reads.push(params);
        return { contents: [{ uri: "crew://note", mimeType: "text/plain", text: "hello" }] };
      },
    }),
  );
  expect(session.tools.map((t) => t.name)).toEqual([
    "mcp_docs_resources_list",
    "mcp_docs_resources_read",
  ]);
  const listed = await session.tools[0]!.execute({}, { workspaceRoot: "/p" });
  expect(listed).toContain("crew://note");
  expect(await session.tools[1]!.execute({ uri: "crew://note" }, { workspaceRoot: "/p" })).toBe(
    "hello",
  );
  expect(reads).toEqual([{ uri: "crew://note" }]);
  await session.close();
});

test("openMcpSession still adds resources when tools/list fails", async () => {
  const session = await openMcpSession(
    "docs",
    scriptedRpc({
      initialize: () => ({
        protocolVersion: "2024-11-05",
        capabilities: { resources: {} },
        serverInfo: { name: "docs" },
      }),
      "tools/list": () => {
        throw new Error("no tools");
      },
      "resources/list": () => ({
        resources: [{ uri: "crew://note", name: "note" }],
      }),
    }),
  );
  expect(session.tools.map((t) => t.name)).toEqual([
    "mcp_docs_resources_list",
    "mcp_docs_resources_read",
  ]);
  await session.close();
});

test("resources_read without uri returns an error string", async () => {
  const session = await openMcpSession(
    "docs",
    scriptedRpc({
      initialize: () => ({
        protocolVersion: "2024-11-05",
        capabilities: { resources: {} },
        serverInfo: { name: "docs" },
      }),
      "tools/list": () => ({ tools: [] }),
    }),
  );
  const read = session.tools.find((t) => t.name === "mcp_docs_resources_read")!;
  expect(await read.execute({}, { workspaceRoot: "/p" })).toBe("mcp error: uri is required");
  await session.close();
});

test("openMcpSession adds prompts list/get when capabilities include prompts", async () => {
  const gets: unknown[] = [];
  const session = await openMcpSession(
    "kit",
    scriptedRpc({
      initialize: () => ({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "kit" },
      }),
      "tools/list": () => ({ tools: [] }),
      "prompts/list": () => ({
        prompts: [{ name: "greet", description: "Say hi", arguments: [{ name: "who", required: true }] }],
      }),
      "prompts/get": (params) => {
        gets.push(params);
        return {
          description: "Say hi",
          messages: [{ role: "user", content: { type: "text", text: "hi Arda" } }],
        };
      },
    }),
  );
  expect(session.tools.map((t) => t.name)).toEqual(["mcp_kit_prompts_list", "mcp_kit_prompts_get"]);
  const listed = await session.tools[0]!.execute({}, { workspaceRoot: "/p" });
  expect(listed).toContain("greet");
  expect(
    await session.tools[1]!.execute({ name: "greet", who: "Arda" }, { workspaceRoot: "/p" }),
  ).toContain("hi Arda");
  expect(gets).toEqual([{ name: "greet", arguments: { who: "Arda" } }]);
  await session.close();
});

test("prompts_get without name returns an error string", async () => {
  const session = await openMcpSession(
    "kit",
    scriptedRpc({
      initialize: () => ({
        protocolVersion: "2024-11-05",
        capabilities: { prompts: {} },
        serverInfo: { name: "kit" },
      }),
      "tools/list": () => ({ tools: [] }),
    }),
  );
  const get = session.tools.find((t) => t.name === "mcp_kit_prompts_get")!;
  expect(await get.execute({}, { workspaceRoot: "/p" })).toBe("mcp error: name is required");
  await session.close();
});

test("stdio MCP resources list/read and prompts get", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-mcp-stdio-rp-"));
  const script = join(import.meta.dir, "mcp-echo-server.ts");
  const rpc = spawnMcpStdio(
    { name: "echo", enabled: true, command: process.execPath, args: [script], env: {} },
    { cwd },
  );
  try {
    const session = await openMcpSession("echo", rpc);
    const names = session.tools.map((t) => t.name);
    expect(names).toContain("mcp_echo_ping");
    expect(names).toContain("mcp_echo_resources_list");
    expect(names).toContain("mcp_echo_resources_read");
    expect(names).toContain("mcp_echo_prompts_list");
    expect(names).toContain("mcp_echo_prompts_get");
    const listed = await session.tools.find((t) => t.name === "mcp_echo_resources_list")!.execute(
      {},
      { workspaceRoot: cwd },
    );
    expect(listed).toContain("echo://pong");
    expect(
      await session.tools
        .find((t) => t.name === "mcp_echo_resources_read")!
        .execute({ uri: "echo://pong" }, { workspaceRoot: cwd }),
    ).toBe("pong");
    expect(
      await session.tools
        .find((t) => t.name === "mcp_echo_prompts_get")!
        .execute({ name: "ping" }, { workspaceRoot: cwd }),
    ).toContain("pong");
    await session.close();
  } finally {
    await rpc.close();
  }
});
