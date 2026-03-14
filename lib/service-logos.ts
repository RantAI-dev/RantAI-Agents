/**
 * Maps known service/tool names to their logo SVG paths in /public/logos/.
 * Used as a fallback when an icon field contains an emoji or is missing.
 */
const SERVICE_LOGO_MAP: Record<string, string> = {
  // Exact IDs
  slack: "/logos/slack.svg",
  github: "/logos/github.svg",
  gmail: "/logos/gmail.svg",
  "google-calendar": "/logos/google-calendar.svg",
  "google-drive": "/logos/google-drive.svg",
  linear: "/logos/linear.svg",
  notion: "/logos/notion.svg",
  discord: "/logos/discord.svg",
}

/** Normalize a name for logo lookup: lowercase, strip common suffixes */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(mcp|server|client|integration|api)\s*/gi, "")
    .replace(/[^a-z0-9-]/g, "")
    .trim()
}

/**
 * Resolve a service logo path from a name or ID.
 * Returns the logo path if found, otherwise undefined.
 */
export function getServiceLogo(nameOrId: string): string | undefined {
  const lower = nameOrId.toLowerCase()
  // Direct match
  if (SERVICE_LOGO_MAP[lower]) return SERVICE_LOGO_MAP[lower]
  // Normalized match
  const normalized = normalize(nameOrId)
  if (SERVICE_LOGO_MAP[normalized]) return SERVICE_LOGO_MAP[normalized]
  // Partial match — check if any key is contained in the name
  for (const [key, path] of Object.entries(SERVICE_LOGO_MAP)) {
    if (lower.includes(key)) return path
  }
  return undefined
}
