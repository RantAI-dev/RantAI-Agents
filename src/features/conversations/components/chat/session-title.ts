export const SESSION_TITLE_MAX_LENGTH = 200

/**
 * Normalizes a rename input. Returns the title to save, or null when the
 * rename should be ignored (empty / whitespace-only, or unchanged).
 */
export function normalizeSessionTitleInput(raw: string, current: string): string | null {
  const next = raw.replace(/\s+/g, " ").trim().slice(0, SESSION_TITLE_MAX_LENGTH)
  if (!next) return null
  if (next === current.trim()) return null
  return next
}
