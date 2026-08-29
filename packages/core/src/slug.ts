export const RESERVED_IDS = new Set(["human", "you", "everyone", "engine", "user"]);

export function assertSlug(id: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error(`invalid slug: ${id}`);
  }
}

export function assertBotId(id: string): void {
  assertSlug(id);
  if (RESERVED_IDS.has(id)) throw new Error(`reserved id: ${id}`);
}
