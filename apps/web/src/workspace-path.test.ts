import { expect, test } from "bun:test";
import {
  resolveWorkspaceHint,
  sanitizeFolderHints,
  workspaceRelPath,
} from "../public/workspace-path.js";

test("workspaceRelPath strips cwd and rejects traversal and secrets", () => {
  expect(workspaceRelPath("C:/proj/apps/web", "C:/proj")).toBe("apps/web");
  expect(
    workspaceRelPath("C:\\proj\\apps\\web\\public\\app.js", "C:\\proj"),
  ).toBe("apps/web/public/app.js");
  expect(workspaceRelPath("apps/web", "C:/proj")).toBe("apps/web");
  expect(workspaceRelPath("../.env", "C:/proj")).toBe("");
  expect(workspaceRelPath("src/.env", "C:/proj")).toBe("");
  expect(workspaceRelPath(".ssh/id_rsa", "C:/proj")).toBe("");
  expect(workspaceRelPath("", "C:/proj")).toBe("");
});

test("resolveWorkspaceHint unique leaf becomes the workspace path", () => {
  expect(resolveWorkspaceHint("app.js", ["apps/web/public/app.js"])).toBe(
    "apps/web/public/app.js",
  );
  expect(
    resolveWorkspaceHint("src", ["apps/web/src/a.ts", "apps/web/src/b.ts"]),
  ).toBe("apps/web/src");
  expect(
    resolveWorkspaceHint("src", [
      "apps/web/src/a.ts",
      "packages/core/src/b.ts",
    ]),
  ).toBe("src");
});

test("sanitizeFolderHints drops secrets and duplicates", () => {
  expect(
    sanitizeFolderHints(
      ["C:/proj/src", "src", "..\\.env", "public"],
      "C:/proj",
    ),
  ).toEqual(["src", "public"]);
});
