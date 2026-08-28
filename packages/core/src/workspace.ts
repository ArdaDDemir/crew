import { asSkillDoc, skillSlug } from "./skill-md";
import { assertBotId } from "./slug";
import type { Channel } from "./router";

export type PermissionMode =
  | "supervised"
  | "auto-accept"
  | "auto"
  | "full-access";

export type SkillCatalogItem = {
  name: string;
  description: string;
  body?: string;
};

export type BotRecord = {
  id: string;
  name: string;
  soul?: string;
  standingOrders?: string;
  skills?: SkillCatalogItem[];
  model?: string;
  fallbackModel?: string;
  titleModel?: string;
  icon?: string;
  harness?: string | null;
  harnessModel?: string | null;
};

export type ChannelRecord = Channel & {
  permissionMode: PermissionMode;
  rules?: string;
  context?: string;
  title?: string;
  icon?: string;
  folders?: string[];
};

export type BotPatch = Partial<
  Pick<
    BotRecord,
    | "name"
    | "soul"
    | "standingOrders"
    | "model"
    | "fallbackModel"
    | "titleModel"
    | "icon"
    | "harness"
    | "harnessModel"
  >
>;

export type ChannelPatch = Partial<
  Pick<
    ChannelRecord,
    | "title"
    | "icon"
    | "leadBotId"
    | "memberBotIds"
    | "permissionMode"
    | "rules"
    | "context"
    | "folders"
  >
>;

export interface Workspace {
  addBot(bot: BotRecord): void;
  getBot(id: string): BotRecord | undefined;
  listBots(): BotRecord[];
  updateBot(id: string, patch: BotPatch): BotRecord;
  addSkill(
    botId: string,
    skill: { name: string; description: string; body?: string },
  ): void;
  getSkill(
    botId: string,
    name: string,
  ): { name: string; description: string; body: string; markdown: string } | undefined;
  removeSkill(botId: string, name: string): void;
  addChannel(channel: ChannelRecord): void;
  getChannel(id: string): ChannelRecord | undefined;
  listChannels(): ChannelRecord[];
  setChannelMode(id: string, mode: PermissionMode): void;
  updateChannel(id: string, patch: ChannelPatch): ChannelRecord;
  removeBot(id: string): void;
  removeChannel(id: string): void;
}

function applyPatch<T extends object>(base: T, patch: Partial<T>): T {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch) as [keyof T, T[keyof T] | undefined][]) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

export class MemoryWorkspace implements Workspace {
  private readonly bots = new Map<string, BotRecord>();
  private readonly channels = new Map<string, ChannelRecord>();

  addBot(bot: BotRecord): void {
    assertBotId(bot.id);
    this.bots.set(bot.id, bot);
  }

  getBot(id: string): BotRecord | undefined {
    return this.bots.get(id);
  }

  listBots(): BotRecord[] {
    return [...this.bots.values()];
  }

  addChannel(channel: ChannelRecord): void {
    this.channels.set(channel.id, channel);
  }

  getChannel(id: string): ChannelRecord | undefined {
    return this.channels.get(id);
  }

  listChannels(): ChannelRecord[] {
    return [...this.channels.values()];
  }

  setChannelMode(id: string, mode: PermissionMode): void {
    const channel = this.channels.get(id);
    if (!channel) throw new Error(`unknown channel: ${id}`);
    this.channels.set(id, { ...channel, permissionMode: mode });
  }

  updateBot(id: string, patch: BotPatch): BotRecord {
    const bot = this.bots.get(id);
    if (!bot) throw new Error(`unknown bot: ${id}`);
    const next = applyPatch(bot, patch);
    this.bots.set(id, next);
    return next;
  }

  addSkill(
    botId: string,
    skill: { name: string; description: string; body?: string },
  ): void {
    const bot = this.bots.get(botId);
    if (!bot) throw new Error(`unknown bot: ${botId}`);
    const doc = asSkillDoc({
      name: skill.name,
      description: skill.description,
      body: skill.body ?? "",
    });
    const skills = [...(bot.skills ?? [])];
    const i = skills.findIndex((s) => s.name.toLowerCase() === doc.name);
    const item = { name: doc.name, description: doc.description, body: doc.body };
    if (i === -1) skills.push(item);
    else skills[i] = item;
    this.bots.set(botId, { ...bot, skills });
  }

  getSkill(botId: string, name: string) {
    const bot = this.bots.get(botId);
    if (!bot) return undefined;
    const want = skillSlug(name);
    const hit = (bot.skills ?? []).find((s) => s.name.toLowerCase() === want);
    if (!hit) return undefined;
    return asSkillDoc({ name: hit.name, description: hit.description, body: hit.body ?? "" });
  }

  removeSkill(botId: string, name: string): void {
    const bot = this.bots.get(botId);
    if (!bot) throw new Error(`unknown bot: ${botId}`);
    const want = skillSlug(name);
    const skills = (bot.skills ?? []).filter((s) => s.name.toLowerCase() !== want);
    if (skills.length === (bot.skills ?? []).length) {
      throw new Error(`unknown skill: ${botId}/${name}`);
    }
    this.bots.set(botId, { ...bot, skills });
  }

  updateChannel(id: string, patch: ChannelPatch): ChannelRecord {
    const channel = this.channels.get(id);
    if (!channel) throw new Error(`unknown channel: ${id}`);
    const next = applyPatch(channel, patch);
    this.channels.set(id, next);
    return next;
  }

  removeBot(id: string): void {
    if (!this.bots.has(id)) throw new Error(`unknown bot: ${id}`);
    this.bots.delete(id);
    for (const ch of this.channels.values()) {
      const members = ch.memberBotIds ?? [];
      if (!members.includes(id) && ch.leadBotId !== id) continue;
      const memberBotIds = members.filter((b) => b !== id);
      const leadBotId = ch.leadBotId === id ? memberBotIds[0] : ch.leadBotId;
      this.channels.set(ch.id, { ...ch, memberBotIds, leadBotId });
    }
  }

  removeChannel(id: string): void {
    if (!this.channels.has(id)) throw new Error(`unknown channel: ${id}`);
    this.channels.delete(id);
  }
}
