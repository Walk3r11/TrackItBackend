export function normalizeTicketId(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      trimmed
    )
  ) {
    return null;
  }
  return trimmed;
}
