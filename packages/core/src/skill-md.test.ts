import { expect, test } from "bun:test";
import { formatSkillMd, parseSkillMd, skillSlug } from "./skill-md";
import { MemoryWorkspace } from "./workspace";

test("skillSlug lowercases and hyphenates", () => {
  expect(skillSlug("html")).toBe("html");
  expect(skillSlug("HTML Pages")).toBe("html-pages");
  expect(() => skillSlug("???")).toThrow("invalid skill name");
});

test("formatSkillMd is valid YAML frontmatter and parseSkillMd round-trips", () => {
  const md = formatSkillMd({
    name: "html",
    description: "Write semantic HTML. Use when building pages.",
    body: "Always use <section> landmarks.",
  });
  expect(md.startsWith("---\n")).toBe(true);
  expect(md).toContain("name: html");
  expect(md).toContain("description:");
  const parsed = parseSkillMd(md);
  expect(parsed.name).toBe("html");
  expect(parsed.description).toContain("semantic HTML");
  expect(parsed.body).toContain("section");
});

test("removeSkill drops the catalog entry", () => {
  const ws = new MemoryWorkspace();
  ws.addBot({ id: "coder", name: "Coder" });
  ws.addSkill("coder", { name: "html", description: "HTML pages", body: "Use sections." });
  expect(ws.getSkill("coder", "html")?.markdown).toContain("name: html");
  ws.removeSkill("coder", "html");
  expect(ws.getSkill("coder", "html")).toBeUndefined();
  expect(() => ws.removeSkill("coder", "html")).toThrow("unknown skill");
});
