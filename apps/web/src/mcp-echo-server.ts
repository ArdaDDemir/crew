/** Local MCP echo used only by unit tests. Speaks JSON-RPC with Content-Length. */

let buf = Buffer.alloc(0);

function send(obj: unknown) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function handle(msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }) {
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "echo" },
      },
    });
    return;
  }
  if (msg.method === "notifications/initialized") return;
  if (msg.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: [
          {
            name: "ping",
            description: "ping",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
    return;
  }
  if (msg.method === "tools/call") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: { content: [{ type: "text", text: "pong" }] },
    });
    return;
  }
  if (msg.id !== undefined) send({ jsonrpc: "2.0", id: msg.id, result: {} });
}

for await (const chunk of Bun.stdin.stream()) {
  buf = Buffer.concat([buf, Buffer.from(chunk)]);
  while (true) {
    const idx = buf.indexOf(Buffer.from("\r\n\r\n"));
    if (idx < 0) break;
    const header = buf.subarray(0, idx).toString("utf8");
    const m = header.match(/Content-Length:\s*(\d+)/i);
    const n = m ? Number(m[1]) : 0;
    const start = idx + 4;
    if (buf.length < start + n) break;
    const msg = JSON.parse(buf.subarray(start, start + n).toString("utf8")) as {
      id?: unknown;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    buf = buf.subarray(start + n);
    handle(msg);
  }
}
