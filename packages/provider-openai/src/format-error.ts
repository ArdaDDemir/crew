export function formatProviderError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        code?: number | string;
        metadata?: { raw?: string; provider_name?: string };
      };
    };
    const meta = parsed.error?.metadata;
    const upstream = meta?.raw ?? "";
    const providerName = meta?.provider_name;
    if (status === 429 || parsed.error?.code === 429 || /rate-limit/i.test(upstream)) {
      const who = providerName ? ` via ${providerName}` : "";
      return `429 rate-limited${who}. Free shared pool is full. Wait 30–60s, tag one bot, or switch model.`;
    }
    const msg = parsed.error?.message ?? parsed.error;
    if (typeof msg === "string" && /inference processing failed/i.test(msg)) {
      return `${status}: Inference processing failed (provider dropped the generation). Retry the same say; if it repeats, tag one bot.`;
    }
    if (typeof msg === "string" && msg.length > 0) {
      return `${status}: ${msg}`;
    }
  } catch {
    // not JSON
  }
  const trimmed = body.replace(/\s+/g, " ").slice(0, 240);
  return `provider ${status}: ${trimmed}`;
}

export function isRateLimitError(message: string | undefined): boolean {
  if (!message) return false;
  return /\b429\b/.test(message) || /rate-limit/i.test(message);
}
