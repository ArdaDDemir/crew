export function shortenChatError(text: string): string {
  const raw = String(text ?? "").trim();
  if (!raw) return raw;
  const jsonAt = raw.indexOf("{");
  let providerName = "";
  if (jsonAt >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonAt)) as {
        error?: {
          message?: string;
          code?: number | string;
          metadata?: { raw?: string; provider_name?: string };
        };
        user_id?: string;
      };
      providerName = parsed.error?.metadata?.provider_name ?? "";
      const code = parsed.error?.code;
      const upstream = parsed.error?.metadata?.raw ?? "";
      if (code === 429 || /rate-limit/i.test(raw) || /rate-limit/i.test(upstream)) {
        const who = providerName ? ` via ${providerName}` : "";
        return `429 rate-limited${who}. Free shared pool is full. Wait 30–60s, tag one bot, or switch model.`;
      }
      const msg = parsed.error?.message;
      if (typeof msg === "string" && msg.trim()) {
        const prefix = raw.slice(0, jsonAt).trim();
        return `${prefix} ${msg}`.trim().slice(0, 220);
      }
    } catch {
      /* not JSON */
    }
  }
  if (/429|rate-limit/i.test(raw)) {
    const who = providerName || raw.match(/via ([A-Za-z0-9 .+-]+)/)?.[1];
    return `429 rate-limited${who ? ` via ${who}` : ""}. Free shared pool is full. Wait 30–60s, tag one bot, or switch model.`;
  }
  if (jsonAt >= 0) return raw.replace(/\s+/g, " ").slice(0, 220);
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}
