const MENTION = /(^|[^A-Za-z0-9_/])@([A-Za-z][A-Za-z0-9-]*)/g;

export function parseMentions(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const slug = match[2].toLowerCase();
    if (seen.has(slug)) continue;
    seen.add(slug);
    ordered.push(slug);
  }
  return ordered;
}
