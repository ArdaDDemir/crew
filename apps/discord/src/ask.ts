export type AskDecision = "allow" | "deny" | "always";

export type AskButton = {
  type: 2;
  style: 2 | 3 | 4;
  custom_id: string;
  label: string;
};

export type AskCard = {
  content: string;
  components: [{ type: 1; components: AskButton[] }];
};

function toolHint(tool: string, args: Record<string, unknown>): string {
  if (typeof args.path === "string" && args.path.trim()) return `${tool} ${args.path.trim()}`;
  if (typeof args.url === "string" && args.url.trim()) return `${tool} ${args.url.trim()}`;
  if (typeof args.command === "string" && args.command.trim()) {
    return `${tool} ${args.command.trim().slice(0, 80)}`;
  }
  return tool;
}

export function askCardPayload(
  botId: string,
  tool: string,
  args: Record<string, unknown>,
): AskCard {
  return {
    content: `Crew: @${botId} wants ${toolHint(tool, args)}`,
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: "crew:allow", label: "Allow" },
          { type: 2, style: 2, custom_id: "crew:always", label: "Always" },
          { type: 2, style: 4, custom_id: "crew:deny", label: "Deny" },
        ],
      },
    ],
  };
}

export function decisionFromCustomId(customId: string): AskDecision | undefined {
  if (customId === "crew:allow") return "allow";
  if (customId === "crew:always") return "always";
  if (customId === "crew:deny") return "deny";
  return undefined;
}

export function decideAskClick(input: {
  customId: string;
  clickerId: string;
  authorId: string;
}): AskDecision | undefined {
  if (input.clickerId !== input.authorId) return undefined;
  return decisionFromCustomId(input.customId);
}
