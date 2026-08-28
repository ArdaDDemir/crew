import { assertBotId, assertSlug } from "./slug";
import type { PermissionMode, Workspace } from "./workspace";
import type { ToolSpec } from "./provider";

export const MAX_BOTS = 16;
export const MAX_CHANNELS = 16;



export type OrgCtx = {
  workspace: Workspace;
  botId: string;
  channelId?: string;
};

export const ORG_TOOL_NAMES = new Set([
  "bot_create",
  "channel_create",
  "self_update",
  "skill_acquire",
]);

export const orgToolSpecs: ToolSpec[] = [
  {
    name: "bot_create",
    description:
      "Create a new crew member. They are added to this channel. Do not copy yourself. They are not woken this turn — @ them later.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "slug, e.g. researcher" },
        name: { type: "string" },
        soul: { type: "string", description: "voice / who they are" },
        icon: { type: "string" },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "channel_create",
    description: "Create a new channel. You become a member. Lead defaults to you.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "slug, e.g. research" },
        title: { type: "string" },
        members: {
          type: "string",
          description: "comma-separated bot ids; you are included",
        },
        lead: { type: "string" },
        context: { type: "string" },
        rules: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "self_update",
    description: "Edit your own name, icon, soul, or standing orders. Not another bot.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        icon: { type: "string" },
        soul: { type: "string" },
        standingOrders: { type: "string" },
      },
    },
  },
  {
    name: "skill_acquire",
    description:
      "Give a skill. If that skill already exists on any bot, it is copied. If it does not, only you may write a new SKILL.md for yourself (research first, then pass body). Do not invent a skill onto someone else.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        target: { type: "string", description: "bot id; default you" },
        from: { type: "string", description: "copy from this bot id if set" },
        description: { type: "string" },
        body: { type: "string", description: "procedure; required to create a new skill on yourself" },
      },
      required: ["name"],
    },
  },
];

export function orgNeedsAsk(mode: PermissionMode, name: string): boolean {
  if (name !== "bot_create" && name !== "channel_create") return false;
  return mode === "supervised" || mode === "auto";
}

function findSkill(
  workspace: Workspace,
  name: string,
  from?: string,
): { botId: string; name: string; description: string; body: string } | undefined {
  const want = name.toLowerCase();
  const bots = from ? [workspace.getBot(from)].filter(Boolean) : workspace.listBots();
  for (const bot of bots) {
    if (!bot) continue;
    const hit = workspace.getSkill(bot.id, name);
    if (hit) return { botId: bot.id, ...hit };
    const listed = (bot.skills ?? []).find((s) => s.name.toLowerCase() === want);
    if (listed) {
      const full = workspace.getSkill(bot.id, listed.name);
      if (full) return { botId: bot.id, ...full };
    }
  }
  return undefined;
}

function skillIndex(workspace: Workspace): string {
  const rows: string[] = [];
  for (const bot of workspace.listBots()) {
    for (const s of bot.skills ?? []) {
      rows.push(`@${bot.id}/${s.name}`);
    }
  }
  return rows.length ? `known skills: ${rows.join(", ")}` : "known skills: (none)";
}

export function runOrgTool(name: string, args: Record<string, unknown>, ctx: OrgCtx): string {
  if (name === "self_update") return selfUpdate(args, ctx);
  if (name === "skill_acquire") return skillAcquire(args, ctx);
  if (name === "bot_create") return botCreate(args, ctx);
  if (name === "channel_create") return channelCreate(args, ctx);
  throw new Error(`unknown org tool: ${name}`);
}

function selfUpdate(args: Record<string, unknown>, ctx: OrgCtx): string {
  const patch: {
    name?: string;
    icon?: string;
    soul?: string;
    standingOrders?: string;
  } = {};
  if (typeof args.name === "string" && args.name.trim()) patch.name = args.name.trim();
  if (typeof args.icon === "string") patch.icon = args.icon.trim();
  if (typeof args.soul === "string") patch.soul = args.soul;
  if (typeof args.standingOrders === "string") patch.standingOrders = args.standingOrders;
  if (Object.keys(patch).length === 0) return "self_update: nothing to change";
  ctx.workspace.updateBot(ctx.botId, patch);
  return `updated self @${ctx.botId}: ${Object.keys(patch).join(", ")}`;
}

function skillAcquire(args: Record<string, unknown>, ctx: OrgCtx): string {
  const name = String(args.name ?? "").trim();
  if (!name) throw new Error("skill name required");
  const target = String(args.target ?? ctx.botId).trim() || ctx.botId;
  if (!ctx.workspace.getBot(target)) throw new Error(`unknown bot: ${target}`);
  const from = typeof args.from === "string" && args.from.trim() ? args.from.trim() : undefined;
  const existing = findSkill(ctx.workspace, name, from);
  if (existing) {
    ctx.workspace.addSkill(target, {
      name: existing.name,
      description: existing.description,
      body: existing.body,
    });
    return `copied skill "${existing.name}" from @${existing.botId} to @${target}`;
  }
  if (target !== ctx.botId) {
    throw new Error(
      `skill "${name}" is not in the crew. @${target} must research and skill_acquire it themselves. ${skillIndex(ctx.workspace)}`,
    );
  }
  const description = String(args.description ?? "").trim();
  const body = String(args.body ?? "").trim();
  if (!description || !body) {
    throw new Error(
      `skill "${name}" does not exist yet. Research, then call skill_acquire on yourself with description and body. ${skillIndex(ctx.workspace)}`,
    );
  }
  ctx.workspace.addSkill(ctx.botId, { name, description, body });
  return `wrote skill "${name}" on @${ctx.botId}`;
}

function botCreate(args: Record<string, unknown>, ctx: OrgCtx): string {
  const id = String(args.id ?? "").trim();
  const name = String(args.name ?? "").trim();
  if (!id || !name) throw new Error("id and name required");
  assertBotId(id);
  if (ctx.workspace.getBot(id)) throw new Error(`bot exists: ${id}`);
  if (ctx.workspace.listBots().length >= MAX_BOTS) {
    throw new Error(`bot cap ${MAX_BOTS}`);
  }
  const soul =
    typeof args.soul === "string" && args.soul.trim()
      ? args.soul
      : `You are ${name} (@${id}).`;
  const icon = typeof args.icon === "string" ? args.icon.trim() : undefined;
  ctx.workspace.addBot({ id, name, soul, icon: icon || undefined });
  if (ctx.channelId) {
    const ch = ctx.workspace.getChannel(ctx.channelId);
    if (ch && !ch.memberBotIds.includes(id)) {
      ctx.workspace.updateChannel(ctx.channelId, {
        memberBotIds: [...ch.memberBotIds, id],
      });
    }
  }
  return `created @${id} (${name}). Not woken this turn — @ them on a later say if they should work.`;
}

function channelCreate(args: Record<string, unknown>, ctx: OrgCtx): string {
  const id = String(args.id ?? "").trim();
  if (!id) throw new Error("id required");
  assertSlug(id);
  if (ctx.workspace.getChannel(id)) throw new Error(`channel exists: ${id}`);
  if (ctx.workspace.listChannels().length >= MAX_CHANNELS) {
    throw new Error(`channel cap ${MAX_CHANNELS}`);
  }
  const rawMembers = String(args.members ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const memberBotIds = [...new Set([ctx.botId, ...rawMembers])];
  for (const botId of memberBotIds) {
    if (!ctx.workspace.getBot(botId)) throw new Error(`unknown bot: ${botId}`);
  }
  const lead = String(args.lead ?? ctx.botId).trim() || ctx.botId;
  if (!memberBotIds.includes(lead)) {
    throw new Error("lead must be a member");
  }
  ctx.workspace.addChannel({
    id,
    title: typeof args.title === "string" && args.title.trim() ? args.title.trim() : id,
    leadBotId: lead,
    memberBotIds,
    permissionMode: "auto-accept",
    context: typeof args.context === "string" ? args.context : "",
    rules: typeof args.rules === "string" ? args.rules : "",
  });
  return `created #${id} (lead @${lead}, members ${memberBotIds.map((m) => `@${m}`).join(" ")})`;
}
