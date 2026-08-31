import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  asSkillDoc,
  assertBotId,
  assertSlug,
  parseSkillMd,
  skillSlug,
  type BotPatch,
  type BotRecord,
  type ChannelPatch,
  type ChannelRecord,
  type PermissionMode,
  type Workspace,
} from "@crew/core";

type ChannelFile = {
  id: string;
  title?: string;
  icon?: string;
  leadBotId?: string;
  memberBotIds: string[];
  permissionMode: PermissionMode;
  folders?: string[];
};

type BotFile = {
  id: string;
  name: string;
  model?: string;
  fallbackModel?: string;
  titleModel?: string;
  icon?: string;
  harness?: string | null;
  harnessModel?: string | null;
  effort?: string;
};

function applyDefined<T extends object>(base: T, patch: Partial<T>): T {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch) as [keyof T, T[keyof T] | undefined][]) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

export class FsWorkspace implements Workspace {
  constructor(private readonly root: string) {}

  addBot(bot: BotRecord): void {
    assertBotId(bot.id);
    if (this.getBot(bot.id)) throw new Error(`bot exists: ${bot.id}`);
    const dir = join(this.root, "bots", bot.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "bot.json"),
      `${JSON.stringify({ id: bot.id, name: bot.name, model: bot.model, fallbackModel: bot.fallbackModel, titleModel: bot.titleModel, icon: bot.icon, harness: bot.harness ?? null, harnessModel: bot.harnessModel ?? null, effort: bot.effort }, null, 2)}\n`,
    );
    writeFileSync(
      join(dir, "SOUL.md"),
      bot.soul?.trim()
        ? bot.soul
        : `# ${bot.name}\n\nYou are ${bot.name} (${bot.id}).\n`,
    );
    writeFileSync(join(dir, "AGENTS.md"), bot.standingOrders ?? "");
    mkdirSync(join(dir, "skills"), { recursive: true });
  }

  getBot(id: string): BotRecord | undefined {
    const path = join(this.root, "bots", id, "bot.json");
    if (!existsSync(path)) return undefined;
    const base = JSON.parse(readFileSync(path, "utf8")) as BotRecord;
    const soulPath = join(this.root, "bots", id, "SOUL.md");
    const ordersPath = join(this.root, "bots", id, "AGENTS.md");
    return {
      ...base,
      soul: existsSync(soulPath) ? readFileSync(soulPath, "utf8") : "",
      standingOrders: existsSync(ordersPath) ? readFileSync(ordersPath, "utf8") : "",
      skills: this.readSkills(id),
    };
  }

  listBots(): BotRecord[] {
    const dir = join(this.root, "bots");
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => this.getBot(d.name))
      .filter((b): b is BotRecord => b !== undefined);
  }

  addChannel(channel: ChannelRecord): void {
    assertSlug(channel.id);
    if (this.getChannel(channel.id)) throw new Error(`channel exists: ${channel.id}`);
    for (const id of channel.memberBotIds) {
      if (!this.getBot(id)) {
        throw new Error(`unknown bot: ${id}`);
      }
    }
    if (channel.leadBotId && !this.getBot(channel.leadBotId)) {
      throw new Error(`unknown bot: ${channel.leadBotId}`);
    }
    const dir = join(this.root, "channels", channel.id);
    mkdirSync(dir, { recursive: true });
    const file: ChannelFile = {
      id: channel.id,
      title: channel.title,
      icon: channel.icon,
      leadBotId: channel.leadBotId,
      memberBotIds: channel.memberBotIds,
      permissionMode: channel.permissionMode,
      folders: channel.folders,
    };
    writeFileSync(join(dir, "channel.json"), `${JSON.stringify(file, null, 2)}\n`);
    writeFileSync(join(dir, "RULES.md"), channel.rules ?? "");
    writeFileSync(join(dir, "CONTEXT.md"), channel.context ?? "");
  }

  getChannel(id: string): ChannelRecord | undefined {
    const path = join(this.root, "channels", id, "channel.json");
    if (!existsSync(path)) return undefined;
    const base = JSON.parse(readFileSync(path, "utf8")) as ChannelRecord;
    const dir = join(this.root, "channels", id);
    const rulesPath = join(dir, "RULES.md");
    const contextPath = join(dir, "CONTEXT.md");
    return {
      ...base,
      rules: existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : "",
      context: existsSync(contextPath) ? readFileSync(contextPath, "utf8") : "",
    };
  }

  setChannelMode(id: string, mode: PermissionMode): void {
    const channel = this.getChannel(id);
    if (!channel) throw new Error(`unknown channel: ${id}`);
    const path = join(this.root, "channels", id, "channel.json");
    this.updateChannel(id, { permissionMode: mode });
  }

  updateBot(id: string, patch: BotPatch): BotRecord {
    const bot = this.getBot(id);
    if (!bot) throw new Error(`unknown bot: ${id}`);
    const dir = join(this.root, "bots", id);
    const next: BotRecord = applyDefined(bot, patch);
    const file: BotFile = {
      id: next.id,
      name: next.name,
      model: next.model,
      fallbackModel: next.fallbackModel,
      titleModel: next.titleModel,
      icon: next.icon,
      harness: next.harness ?? null,
      harnessModel: next.harnessModel ?? null,
      effort: next.effort,
    };
    writeFileSync(join(dir, "bot.json"), `${JSON.stringify(file, null, 2)}\n`);
    if (patch.soul !== undefined) {
      writeFileSync(join(dir, "SOUL.md"), patch.soul);
    }
    if (patch.standingOrders !== undefined) {
      writeFileSync(join(dir, "AGENTS.md"), patch.standingOrders);
    }
    return this.getBot(id)!;
  }

  addSkill(
    botId: string,
    skill: { name: string; description: string; body?: string },
  ): void {
    if (!this.getBot(botId)) throw new Error(`unknown bot: ${botId}`);
    const doc = asSkillDoc({
      name: skill.name,
      description: skill.description,
      body: skill.body ?? "",
    });
    const dir = join(this.root, "bots", botId, "skills", doc.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), doc.markdown);
  }

  getSkill(botId: string, name: string) {
    if (!this.getBot(botId)) return undefined;
    const dir = join(this.root, "bots", botId, "skills");
    if (!existsSync(dir)) return undefined;
    let want = name.toLowerCase();
    try {
      want = skillSlug(name);
    } catch {
      /* keep raw */
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(dir, entry.name, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      const parsed = parseSkillMd(readFileSync(skillMd, "utf8"));
      const parsedName = parsed.name || entry.name;
      if (parsedName.toLowerCase() !== want && entry.name !== want) continue;
      return asSkillDoc({
        name: parsedName || entry.name,
        description: parsed.description,
        body: parsed.body,
      });
    }
    return undefined;
  }

  removeSkill(botId: string, name: string): void {
    if (!this.getBot(botId)) throw new Error(`unknown bot: ${botId}`);
    const dir = join(this.root, "bots", botId, "skills");
    if (!existsSync(dir)) throw new Error(`unknown skill: ${botId}/${name}`);
    let want = name.toLowerCase();
    try {
      want = skillSlug(name);
    } catch {
      /* keep raw */
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(dir, entry.name, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      const parsed = parseSkillMd(readFileSync(skillMd, "utf8"));
      const parsedName = parsed.name || entry.name;
      if (parsedName.toLowerCase() !== want && entry.name !== want) continue;
      rmSync(join(dir, entry.name), { recursive: true, force: true });
      return;
    }
    throw new Error(`unknown skill: ${botId}/${name}`);
  }

  updateChannel(id: string, patch: ChannelPatch): ChannelRecord {
    const channel = this.getChannel(id);
    if (!channel) throw new Error(`unknown channel: ${id}`);
    const next: ChannelRecord = applyDefined(channel, patch);
    if (next.memberBotIds) {
      for (const botId of next.memberBotIds) {
        if (!this.getBot(botId)) throw new Error(`unknown bot: ${botId}`);
      }
    }
    const dir = join(this.root, "channels", id);
    const file: ChannelFile = {
      id: next.id,
      title: next.title,
      icon: next.icon,
      leadBotId: next.leadBotId,
      memberBotIds: next.memberBotIds,
      permissionMode: next.permissionMode,
      folders: next.folders,
    };
    writeFileSync(join(dir, "channel.json"), `${JSON.stringify(file, null, 2)}\n`);
    if (patch.rules !== undefined) writeFileSync(join(dir, "RULES.md"), patch.rules);
    if (patch.context !== undefined) {
      writeFileSync(join(dir, "CONTEXT.md"), patch.context);
    }
    return this.getChannel(id)!;
  }

  private readSkills(botId: string): BotRecord["skills"] {
    const dir = join(this.root, "bots", botId, "skills");
    if (!existsSync(dir)) return [];
    const items: NonNullable<BotRecord["skills"]> = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(dir, entry.name, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      const parsed = parseSkillMd(readFileSync(skillMd, "utf8"));
      const name = parsed.name || entry.name;
      items.push({ name, description: parsed.description });
    }
    return items;
  }

  listChannels(): ChannelRecord[] {
    const dir = join(this.root, "channels");
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => this.getChannel(d.name))
      .filter((c): c is ChannelRecord => c !== undefined);
  }

  removeBot(id: string): void {
    if (!this.getBot(id)) throw new Error(`unknown bot: ${id}`);
    for (const ch of this.listChannels()) {
      const members = ch.memberBotIds ?? [];
      if (!members.includes(id) && ch.leadBotId !== id) continue;
      const memberBotIds = members.filter((b) => b !== id);
      const leadBotId = ch.leadBotId === id ? memberBotIds[0] : ch.leadBotId;
      this.updateChannel(ch.id, { memberBotIds, leadBotId });
    }
    rmSync(join(this.root, "bots", id), { recursive: true, force: true });
  }

  removeChannel(id: string): void {
    if (!this.getChannel(id)) throw new Error(`unknown channel: ${id}`);
    rmSync(join(this.root, "channels", id), { recursive: true, force: true });
  }
}
