import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AlwaysRule = { tool: string; key: string };

const KEY_ARGS = ["path", "command", "name", "id"] as const;

export function alwaysPath(crewRoot: string): string {
  return join(crewRoot, "permissions.json");
}

export function fingerprint(tool: string, args: Record<string, unknown>): string {
  const pick: Record<string, unknown> = {};
  for (const k of KEY_ARGS) {
    if (args[k] !== undefined) pick[k] = args[k];
  }
  return `${tool}:${JSON.stringify(pick)}`;
}

export function loadAlways(crewRoot: string): AlwaysRule[] {
  const path = alwaysPath(crewRoot);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { rules?: AlwaysRule[] };
    return Array.isArray(raw.rules) ? raw.rules : [];
  } catch {
    return [];
  }
}

export function saveAlways(crewRoot: string, rules: AlwaysRule[]): void {
  mkdirSync(crewRoot, { recursive: true });
  writeFileSync(alwaysPath(crewRoot), `${JSON.stringify({ rules }, null, 2)}\n`);
}

export function matchesAlways(
  rules: AlwaysRule[],
  tool: string,
  args: Record<string, unknown>,
): boolean {
  const key = fingerprint(tool, args);
  return rules.some((r) => r.tool === tool && r.key === key);
}

export function rememberAlways(
  crewRoot: string,
  tool: string,
  args: Record<string, unknown>,
): AlwaysRule[] {
  const rules = loadAlways(crewRoot);
  const key = fingerprint(tool, args);
  if (!rules.some((r) => r.tool === tool && r.key === key)) {
    rules.push({ tool, key });
    saveAlways(crewRoot, rules);
  }
  return rules;
}

export function removeAlwaysRule(crewRoot: string, tool: string, key: string): AlwaysRule[] {
  const rules = loadAlways(crewRoot).filter((r) => !(r.tool === tool && r.key === key));
  saveAlways(crewRoot, rules);
  return rules;
}
