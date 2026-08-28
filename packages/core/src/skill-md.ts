export type SkillDoc = {
  name: string;
  description: string;
  body: string;
};

export function skillSlug(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64)
    .replace(/-+$/, "");
  if (!s || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) {
    throw new Error(`invalid skill name: ${raw} (use lowercase, digits, hyphens)`);
  }
  return s;
}

export function formatSkillMd(skill: SkillDoc): string {
  const name = skillSlug(skill.name);
  const description = skill.description.replace(/\s+/g, " ").trim();
  if (!description) throw new Error("skill description required");
  if (description.length > 1024) throw new Error("skill description too long (max 1024)");
  const body = `${(skill.body ?? "").replace(/\s+$/, "")}\n`;
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`;
}

export function parseSkillMd(raw: string): SkillDoc {
  const m = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { name: "", description: "", body: String(raw).trim() };
  }
  const fm = m[1] ?? "";
  const nameRaw = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const descRaw = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const name = unquote(nameRaw);
  const description = unquote(descRaw);
  return {
    name,
    description,
    body: (m[2] ?? "").trim(),
  };
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      return JSON.parse(s.startsWith("'") ? `"${s.slice(1, -1)}"` : s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

export function asSkillDoc(skill: SkillDoc): SkillDoc & { markdown: string } {
  const name = skillSlug(skill.name);
  const description = skill.description.replace(/\s+/g, " ").trim();
  const body = skill.body ?? "";
  return {
    name,
    description,
    body,
    markdown: formatSkillMd({ name, description, body }),
  };
}
