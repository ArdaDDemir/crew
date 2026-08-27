import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CrewConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export function userConfigPath(home: string): string {
  return join(home, ".crew", "config.json");
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".crew", "config.json");
}

export function readConfigFile(path: string): CrewConfig {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CrewConfig;
  } catch {
    return {};
  }
}

export function writeConfigFile(path: string, patch: CrewConfig): CrewConfig {
  const current = readConfigFile(path);
  const next = { ...current, ...patch };
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function mergeConfig(input: {
  cwd: string;
  home: string;
  env: NodeJS.ProcessEnv;
}): CrewConfig {
  const user = readConfigFile(userConfigPath(input.home));
  const project = readConfigFile(projectConfigPath(input.cwd));
  return {
    ...user,
    ...project,
    apiKey:
      input.env.OPENROUTER_API_KEY ||
      input.env.CREW_API_KEY ||
      project.apiKey ||
      user.apiKey,
    model: input.env.CREW_MODEL || project.model || user.model,
    baseUrl: input.env.CREW_BASE_URL || project.baseUrl || user.baseUrl,
  };
}

export function maskKey(key: string | undefined): string {
  if (!key) return "(not set)";
  if (key.length < 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function defaultHome(): string {
  return process.env.USERPROFILE || process.env.HOME || homedir();
}
