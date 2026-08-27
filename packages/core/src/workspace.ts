import type { Channel } from "./router";

export type PermissionMode =
  | "supervised"
  | "auto-accept"
  | "auto"
  | "full-access";

export type SkillCatalogItem = {
  name: string;
  description: string;
};

export type BotRecord = {
  id: string;
  name: string;
  soul?: string;
  standingOrders?: string;
  skills?: SkillCatalogItem[];
  model?: string;
  icon?: string;
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
  Pick<BotRecord, "name" | "soul" | "standingOrders" | "model" | "icon">
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
  addChannel(channel: ChannelRecord): void;
  getChannel(id: string): ChannelRecord | undefined;
  listChannels(): ChannelRecord[];
  setChannelMode(id: string, mode: PermissionMode): void;
  updateChannel(id: string, patch: ChannelPatch): ChannelRecord;
}

export class MemoryWorkspace implements Workspace {
  private readonly bots = new Map<string, BotRecord>();
  private readonly channels = new Map<string, ChannelRecord>();

  addBot(bot: BotRecord): void {
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
    const next = { ...bot, ...patch };
    this.bots.set(id, next);
    return next;
  }

  addSkill(
    botId: string,
    skill: { name: string; description: string; body?: string },
  ): void {
    const bot = this.bots.get(botId);
    if (!bot) throw new Error(`unknown bot: ${botId}`);
    const skills = [...(bot.skills ?? [])];
    const i = skills.findIndex((s) => s.name === skill.name);
    const item = { name: skill.name, description: skill.description };
    if (i === -1) skills.push(item);
    else skills[i] = item;
    this.bots.set(botId, { ...bot, skills });
  }

  updateChannel(id: string, patch: ChannelPatch): ChannelRecord {
    const channel = this.channels.get(id);
    if (!channel) throw new Error(`unknown channel: ${id}`);
    const next = { ...channel, ...patch };
    this.channels.set(id, next);
    return next;
  }
}
