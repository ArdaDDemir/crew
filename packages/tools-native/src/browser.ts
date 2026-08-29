import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hardDenyUrl, type Tool } from "@crew/core";

export type A11yNode = {
  ref: string;
  role: string;
  name: string;
  href?: string;
  value?: string;
};

export type BrowserDriver = {
  goto(url: string): Promise<{ url: string; title: string }>;
  snapshot(): Promise<string>;
  click(ref: string): Promise<{ url: string; title: string }>;
  type(ref: string, text: string): Promise<string>;
  screenshot(filePath: string): Promise<void>;
};

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export class MemoryBrowser implements BrowserDriver {
  private pages = new Map<string, { title: string; nodes: A11yNode[] }>();
  private url = "";
  private title = "";
  private nodes: A11yNode[] = [];

  seed(url: string, page: { title: string; nodes: A11yNode[] }): void {
    this.pages.set(url, {
      title: page.title,
      nodes: page.nodes.map((n) => ({ ...n })),
    });
  }

  async goto(url: string): Promise<{ url: string; title: string }> {
    if (hardDenyUrl(url)) throw new Error(`denied url: ${url}`);
    const page = this.pages.get(url) ?? { title: url, nodes: [] };
    this.url = url;
    this.title = page.title;
    this.nodes = page.nodes.map((n) => ({ ...n }));
    return { url: this.url, title: this.title };
  }

  async snapshot(): Promise<string> {
    if (!this.url) return "(no page)";
    const lines = [`url: ${this.url}`, `title: ${this.title}`];
    for (const n of this.nodes) {
      const value = n.value ? ` value=${JSON.stringify(n.value)}` : "";
      lines.push(`- ${n.role} [ref=${n.ref}] ${n.name}${value}`);
    }
    return lines.join("\n");
  }

  async click(ref: string): Promise<{ url: string; title: string }> {
    const node = this.nodes.find((n) => n.ref === ref);
    if (!node) throw new Error(`unknown ref: ${ref}`);
    if (node.href) return this.goto(node.href);
    return { url: this.url, title: this.title };
  }

  async type(ref: string, text: string): Promise<string> {
    const node = this.nodes.find((n) => n.ref === ref);
    if (!node) throw new Error(`unknown ref: ${ref}`);
    node.value = text;
    return `typed into ${ref}`;
  }

  async screenshot(filePath: string): Promise<void> {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, PNG_1X1);
  }
}

export function browserTools(driver: BrowserDriver): Tool[] {
  return [
    {
      name: "browser_open",
      description: "Open a URL in the workspace browser. Not the operator's Chrome. http(s) only.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
      async execute(args) {
        const url = String(args.url ?? "").trim();
        if (!url) throw new Error("url is required");
        if (hardDenyUrl(url)) throw new Error(`denied url: ${url}`);
        const page = await driver.goto(url);
        return `opened ${page.title} (${page.url})`;
      },
    },
    {
      name: "browser_snapshot",
      description: "Accessibility-style snapshot of the current page. Use ref= values with click/type.",
      parameters: { type: "object", properties: {} },
      async execute() {
        return driver.snapshot();
      },
    },
    {
      name: "browser_click",
      description: "Click a node from the last snapshot (ref).",
      parameters: {
        type: "object",
        properties: { ref: { type: "string" } },
        required: ["ref"],
      },
      async execute(args) {
        const ref = String(args.ref ?? "").trim();
        if (!ref) throw new Error("ref is required");
        const page = await driver.click(ref);
        return `clicked ${ref} now ${page.title} (${page.url})`;
      },
    },
    {
      name: "browser_type",
      description: "Type into a node from the last snapshot (ref).",
      parameters: {
        type: "object",
        properties: { ref: { type: "string" }, text: { type: "string" } },
        required: ["ref", "text"],
      },
      async execute(args) {
        const ref = String(args.ref ?? "").trim();
        const text = String(args.text ?? "");
        if (!ref) throw new Error("ref is required");
        return driver.type(ref, text);
      },
    },
    {
      name: "browser_screenshot",
      description: "Save a PNG of the current page under .crew/browser/shots/. Desk only, not the channel account.",
      parameters: { type: "object", properties: {} },
      async execute(_args, ctx) {
        const dir = join(ctx.workspaceRoot, ".crew", "browser", "shots");
        mkdirSync(dir, { recursive: true });
        const rel = join(".crew", "browser", "shots", `${Date.now()}.png`);
        await driver.screenshot(join(ctx.workspaceRoot, rel));
        return `screenshot ${rel.replaceAll("\\", "/")}`;
      },
    },
  ];
}
