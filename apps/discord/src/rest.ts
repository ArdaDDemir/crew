export async function postDiscordMessage(
  token: string,
  channelId: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<Response | undefined> {
  const id = String(channelId ?? "").trim();
  if (!id) return;
  return fetchFn(`https://discord.com/api/v10/channels/${id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function respondDiscordInteraction(
  id: string,
  interactionToken: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await fetchFn(`https://discord.com/api/v10/interactions/${id}/${interactionToken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendDiscordUserDm(
  token: string,
  recipientId: string,
  content: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response | undefined> {
  const text = String(content ?? "").trim().slice(0, 2000);
  const user = String(recipientId ?? "").trim();
  if (!text || !user) return;
  const opened = await fetchFn("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: user }),
  });
  if (opened.status === 429) return opened;
  const ch = (await opened.json()) as { id?: string };
  const id = String(ch.id ?? "").trim();
  if (!id) throw new Error("discord dm channel missing");
  return fetchFn(`https://discord.com/api/v10/channels/${id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: text }),
  });
}
