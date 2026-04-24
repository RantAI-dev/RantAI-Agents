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

const AESTHETIC_LINE_REGEX = /^\s*\/\/\s*@aesthetic\s*:\s*([a-z-]+)\s*$/
const FONTS_LINE_REGEX = /^\s*\/\/\s*@fonts\s*:\s*(.+?)\s*$/

/**
 * Extract `// @aesthetic:` and `// @fonts:` directives from the first two
 * lines of a React artifact. Neither directive is altered in the returned
 * code — the caller is responsible for stripping `rawAestheticLine` /
 * `rawFontsLine` before passing to Babel.
 */
export function parseDirectives(code: string): ParsedDirectives {
  const lines = code.split("\n")
  const line1 = lines[0] ?? ""
  const line2 = lines[1] ?? ""

  const aestheticMatch = line1.match(AESTHETIC_LINE_REGEX)
  const aestheticValue = aestheticMatch?.[1] ?? null
  const aesthetic: AestheticDirection | null =
    aestheticValue && (AESTHETIC_DIRECTIONS as readonly string[]).includes(aestheticValue)
      ? (aestheticValue as AestheticDirection)
      : null
  const rawAestheticLine = aestheticMatch ? line1 : null

  const fontsMatch = line2.match(FONTS_LINE_REGEX)
  const fonts = fontsMatch
    ? fontsMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null
  const rawFontsLine = fontsMatch ? line2 : null

  return { aesthetic, fonts, rawAestheticLine, rawFontsLine }
}
