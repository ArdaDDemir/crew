export async function executeDiscordWebhook(
  url: string,
  row: { username: string; content: string },
  fetchFn: typeof fetch = fetch,
): Promise<Response | undefined> {
  const target = String(url ?? "").trim();
  if (!target) return;
  const content = String(row.content ?? "").slice(0, 2000);
  if (!content.trim()) return;
  return fetchFn(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: String(row.username ?? "Crew").slice(0, 80) || "Crew",
      content,
      allowed_mentions: { parse: [] },
    }),
  });
}
