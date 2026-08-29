import { attachDiscord } from "../../discord/src/attach";
import { loadDiscordConfig, snowflakeForHuman } from "../../discord/src/config";
import { sendDiscordUserDm } from "../../discord/src/rest";
import { createDiscordQueue } from "../../discord/src/queue";
import { resolveAsk, sayChannel, sendDm, type Host } from "./host";

export async function attachDiscordHost(
  host: Host,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ started: boolean; reason?: string }> {
  try {
    const cfg = loadDiscordConfig(host.cwd);
    const token = cfg ? String(env[cfg.tokenEnv] ?? "").trim() : "";
    const queue = createDiscordQueue({
      onDrop: (dest) => {
        console.warn(`discord outbound dropped after rate limits: ${dest}`);
      },
    });
    if (cfg && token) {
      host.onHumanDm = async ({ humanId, text }) => {
        const snowflake = snowflakeForHuman(cfg, humanId);
        if (!snowflake) return;
        queue.enqueue(`user:${snowflake}`, () => sendDiscordUserDm(token, snowflake, text));
      };
    }
    return await attachDiscord({
      cwd: host.cwd,
      env,
      queue,
      say: (channelId, text, humanId, onAsk) =>
        sayChannel(host, channelId, text, undefined, undefined, onAsk, humanId),
      dm: async (botId, text, humanId, onAsk) => {
        const result = await sendDm(
          host,
          "human",
          botId,
          text,
          undefined,
          undefined,
          undefined,
          onAsk,
          humanId,
        );
        return { replies: result.replies };
      },
      botName: (id) => host.workspace.getBot(id)?.name ?? id,
      onAskDecision: (decision) => {
        try {
          resolveAsk(host, decision);
        } catch {
          /* no permission pending */
        }
      },
    });
  } catch (err) {
    return { started: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
