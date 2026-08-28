import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeTools, shellLockPath } from "./tools";

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

test("shell runs a command in the workspace", async () => {
  const { root, tools } = await tmp();
  const out = await tools.shell.execute(
    { command: "echo crew-ok" },
    { workspaceRoot: root },
  );
  expect(out).toContain("crew-ok");
});
