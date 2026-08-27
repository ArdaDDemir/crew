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
};

export type ChannelRecord = Channel & {
  permissionMode: PermissionMode;
  rules?: string;
  context?: string;
};

export interface Workspace {
  addBot(bot: BotRecord): void;
  getBot(id: string): BotRecord | undefined;
  listBots(): BotRecord[];
  addChannel(channel: ChannelRecord): void;
  getChannel(id: string): ChannelRecord | undefined;
  listChannels(): ChannelRecord[];
  setChannelMode(id: string, mode: PermissionMode): void;
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
}
