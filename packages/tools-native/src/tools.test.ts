import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeTools } from "./tools";

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

test("list_dir lists files", async () => {
  const { root, tools } = await tmp();
  await writeFile(join(root, "a.txt"), "x");
  const out = await tools.list_dir.execute({ path: "." }, { workspaceRoot: root });
  expect(out).toContain("a.txt");
});

test("shell runs a command in the workspace", async () => {
  const { root, tools } = await tmp();
  const out = await tools.shell.execute(
    { command: "echo crew-ok" },
    { workspaceRoot: root },
  );
  expect(out).toContain("crew-ok");
});
