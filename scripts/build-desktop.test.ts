import { readFileSync } from "node:fs";
import { join } from "node:path";

test("sidecar compile marks playwright external so Chromium is not bundled", () => {
  const src = readFileSync(join(import.meta.dir, "build-desktop.ts"), "utf8");
  expect(src).toMatch(/"--external",\s*"playwright"/);
});
