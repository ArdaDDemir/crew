import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryBrowser, nativeTools, shellLockPath } from "./tools";

async function tmp() {
  const root = await mkdtemp(join(tmpdir(), "crew-tools-"));
  const tools = Object.fromEntries(nativeTools().map((t) => [t.name, t]));
  return { root, tools };
}

test("read returns file contents", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "hello");
  expect(await tools.read.execute({ path: "a.txt" }, { workspaceRoot: root })).toBe(
    "hello",
  );
});

test("apply_patch replaces old_text", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "hello world");
  await tools.apply_patch.execute(
    { path: "a.txt", old_text: "hello", new_text: "hi" },
    { workspaceRoot: root },
  );
  expect(await readFile(join(root, "a.txt"), "utf8")).toBe("hi world");
});

test("apply_patch fails when old_text is missing", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "abc");
  await expect(
    tools.apply_patch.execute(
      { path: "a.txt", old_text: "nope", new_text: "x" },
      { workspaceRoot: root },
    ),
  ).rejects.toThrow("old_text not found");
});

test("empty old_text does not clobber an existing file", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "keep me");
  await expect(
    tools.apply_patch.execute(
      { path: "a.txt", old_text: "", new_text: "wipe" },
      { workspaceRoot: root },
    ),
  ).rejects.toThrow("file exists");
  expect(await readFile(join(root, "a.txt"), "utf8")).toBe("keep me");
});

test("list_dir lists files", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "x");
  const out = await tools.list_dir.execute({ path: "." }, { workspaceRoot: root });
  expect(out).toContain("a.txt");
});

test("list_dir skips .crew .git .ssh .env and .env.*", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "x");
  await writeFile(join(root, ".env"), "SECRET=1");
  await writeFile(join(root, ".env.local"), "SECRET=2");
  await mkdir(join(root, ".crew"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".ssh"));
  const out = await tools.list_dir.execute({ path: "." }, { workspaceRoot: root });
  expect(out).toContain("a.txt");
  expect(out).not.toContain(".crew");
  expect(out).not.toContain(".git");
  expect(out).not.toContain(".ssh");
  expect(out).not.toContain(".env");
});

test("shellLockPath locks redirects and git, not bun test", async () => {
  const root = "C:\\proj";
  expect(shellLockPath("echo hi > src/a.ts", root)).toBe(join(root, "src/a.ts"));
  expect(shellLockPath("git commit -m ok", root)).toBe(join(root, ".git"));
  expect(shellLockPath("bun test", root)).toBeUndefined();
});

test("apply_patch old_text miss tells the model to re-read", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "abc");
  await expect(
    tools.apply_patch.execute(
      { path: "a.txt", old_text: "nope", new_text: "x" },
      { workspaceRoot: root },
    ),
  ).rejects.toThrow(/old_text not found.*re-read/i);
});

test("apply_patch old_text miss includes a current-file excerpt", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "hero copy here");
  await expect(
    tools.apply_patch.execute(
      { path: "a.txt", old_text: "nope", new_text: "x" },
      { workspaceRoot: root },
    ),
  ).rejects.toThrow(/Current file:[\s\S]*hero copy here/);
});

test("apply_patch duplicate old_text tells the model to pass a unique hunk", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "aa aa");
  await expect(
    tools.apply_patch.execute(
      { path: "a.txt", old_text: "aa", new_text: "bb" },
      { workspaceRoot: root },
    ),
  ).rejects.toThrow(/matched more than once.*unique/i);
});

test("shell timeout reports timed out after the deadline", async () => {
  const root = await mkdtemp(join(tmpdir(), "crew-tools-"));
  const tools = Object.fromEntries(nativeTools({ shellTimeoutMs: 80 }).map((t) => [t.name, t]));
  const out = await tools.shell.execute(
    { command: "powershell -Command \"Start-Sleep -Seconds 5\"" },
    { workspaceRoot: root },
  );
  expect(out.toLowerCase()).toMatch(/timed out/);
  expect(out).toContain("80");
}, 3000);

test("shell runs a command in the workspace", async () => {
  const { root, tools } = await tmp();
  const out = await tools.shell.execute(
    { command: "echo crew-ok" },
    { workspaceRoot: root },
  );
  expect(out).toContain("crew-ok");
});

test("browser tools open snapshot click type on a memory page and deny file urls", async () => {
  const root = await mkdtemp(join(tmpdir(), "crew-tools-"));
  const browser = new MemoryBrowser();
  browser.seed("https://example.test/pricing", {
    title: "Pricing",
    nodes: [
      { ref: "e1", role: "link", name: "Pro plan", href: "https://example.test/pro" },
      { ref: "e2", role: "textbox", name: "Search" },
    ],
  });
  const tools = Object.fromEntries(
    nativeTools({ browser }).map((t) => [t.name, t]),
  );
  const opened = await tools.browser_open.execute(
    { url: "https://example.test/pricing" },
    { workspaceRoot: root },
  );
  expect(opened).toContain("Pricing");
  const snap = await tools.browser_snapshot.execute({}, { workspaceRoot: root });
  expect(snap).toContain("e1");
  expect(snap).toContain("Pro plan");
  await tools.browser_type.execute(
    { ref: "e2", text: "crew" },
    { workspaceRoot: root },
  );
  expect(await tools.browser_snapshot.execute({}, { workspaceRoot: root })).toContain("crew");
  const clicked = await tools.browser_click.execute({ ref: "e1" }, { workspaceRoot: root });
  expect(clicked).toContain("https://example.test/pro");
  await expect(
    tools.browser_open.execute({ url: "file:///C:/Windows" }, { workspaceRoot: root }),
  ).rejects.toThrow(/denied/i);
  const shot = await tools.browser_screenshot.execute({}, { workspaceRoot: root });
  expect(shot).toMatch(/browser[/\\]shots[/\\]/);
});

test("playwright is a tools-native dependency and the module resolves", async () => {
  const pkg = (await Bun.file(join(import.meta.dir, "..", "package.json")).json()) as {
    dependencies?: Record<string, string>;
  };
  expect(pkg.dependencies?.playwright).toBeDefined();
  const pw = await import("playwright");
  expect(pw.chromium).toBeDefined();
});

