import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  decidePermission,
  effectiveMode,
  isDeniedPath,
} from "./permissions";

const root = join("C:", "proj");

test("denies .env and ssh keys in every mode", () => {
  expect(isDeniedPath(join(root, ".env"))).toBe(true);
  expect(isDeniedPath(join(root, ".env.local"))).toBe(true);
  expect(isDeniedPath(join("C:", "Users", "me", ".ssh", "id_rsa"))).toBe(true);
  expect(
    decidePermission({
      mode: "full-access",
      tool: "read",
      absPath: join(root, ".env"),
      workspaceRoot: root,
    }),
  ).toBe("deny");
});

test("auto-accept allows list_dir", () => {
  expect(
    decidePermission({
      mode: "auto-accept",
      tool: "list_dir",
      absPath: join(root, "src"),
      workspaceRoot: root,
    }),
  ).toBe("allow");
});

test("auto-accept allows in-workspace patch and shell", () => {
  expect(
    decidePermission({
      mode: "auto-accept",
      tool: "apply_patch",
      absPath: join(root, "src", "a.ts"),
      workspaceRoot: root,
    }),
  ).toBe("allow");
  expect(
    decidePermission({
      mode: "auto-accept",
      tool: "shell",
      workspaceRoot: root,
    }),
  ).toBe("allow");
});

test("supervised asks before patch, allows in-workspace read", () => {
  expect(
    decidePermission({
      mode: "supervised",
      tool: "read",
      absPath: join(root, "src", "a.ts"),
      workspaceRoot: root,
    }),
  ).toBe("allow");
  expect(
    decidePermission({
      mode: "supervised",
      tool: "apply_patch",
      absPath: join(root, "src", "a.ts"),
      workspaceRoot: root,
    }),
  ).toBe("ask");
});

test("auto without reviewer becomes supervised", () => {
  expect(effectiveMode("auto", false)).toEqual({
    mode: "supervised",
    warned: true,
  });
  expect(effectiveMode("auto", true)).toEqual({ mode: "auto", warned: false });
});
