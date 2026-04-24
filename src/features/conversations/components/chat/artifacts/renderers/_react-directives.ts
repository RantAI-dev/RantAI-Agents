/**
 * Directive parsing for React artifacts.
 *
 * Contract:
 *   Line 1: // @aesthetic: <direction>   (REQUIRED — validator enforces)
 *   Line 2: // @fonts: Family:spec, Family:spec, ...   (OPTIONAL — defaults by direction)
 *
 * Pure functions only. No DOM, no React, no side effects.
 */

export const AESTHETIC_DIRECTIONS = [
  "editorial",
  "brutalist",
  "luxury",
  "playful",
  "industrial",
  "organic",
  "retro-futuristic",
] as const

export type AestheticDirection = (typeof AESTHETIC_DIRECTIONS)[number]

export const DEFAULT_FONTS_BY_DIRECTION: Record<AestheticDirection, string[]> = {
  editorial: [
    "Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900",
    "Inter:wght@400;500;700",
  ],
  brutalist: [
    "Space Grotesk:wght@400;500;700",
    "JetBrains Mono:wght@400;700",
  ],
  luxury: [
    "DM Serif Display:wght@400",
    "DM Sans:wght@300;400;500;700",
  ],
  playful: [
    "Fredoka:wght@400;500;600;700",
  ],
  industrial: [
    "Inter Tight:wght@400;500;700",
    "Space Mono:wght@400;700",
  ],
  organic: [
    "Fraunces:ital,opsz,wght@0,9..144,300..700",
    "Public Sans:wght@400;500",
  ],
  "retro-futuristic": [
    "VT323:wght@400",
    "Space Mono:wght@400;700",
  ],
}

/** Maximum families per artifact. Keeps iframe page-weight bounded. */
export const MAX_FONT_FAMILIES = 3

export interface ParsedDirectives {
  /** Direction parsed from line 1, or null if absent/unknown. */
  aesthetic: AestheticDirection | null
  /** Font specs parsed from line 2, or null if absent/malformed. */
  fonts: string[] | null
  /** Raw aesthetic line if present (for stripping from source). */
  rawAestheticLine: string | null
  /** Raw fonts line if present (for stripping from source). */
  rawFontsLine: string | null
}
