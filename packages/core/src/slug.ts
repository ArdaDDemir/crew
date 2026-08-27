export function assertSlug(id: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error(`invalid slug: ${id}`);
  }
}
