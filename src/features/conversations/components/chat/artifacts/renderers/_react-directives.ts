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

/**
 * Validate a Google Fonts CSS2 family spec. The regex matches the four
 * canonical axis forms: wght, ital+wght, opsz+wght, ital+opsz+wght.
 *
 * Rejects specs with characters outside the safe set (anything beyond
 * alphanumeric, spaces, colons, semicolons, commas, dots, and `@`).
 * This prevents URL injection into the fonts.googleapis.com href.
 */
const FONT_SPEC_REGEX =
  /^[A-Z][A-Za-z0-9 ]{1,40}:(wght@[\d;.]+|ital,wght@[\d;,.]+|opsz,wght@[\d;,.]+|ital,opsz,wght@[\d;,.]+)$/

export function validateFontSpec(spec: string): boolean {
  return FONT_SPEC_REGEX.test(spec)
}

/**
 * Build `<link>` tags for Google Fonts. Called by the renderer's
 * `buildSrcdoc` to inject webfonts into the sandbox.
 *
 * Rules:
 *  - If `fonts` is null, use the direction's default specs.
 *  - If any entry in `fonts` fails `validateFontSpec`, fall back to the
 *    direction default (precision > partial trust).
 *  - If `fonts` exceeds MAX_FONT_FAMILIES, fall back to the direction default.
 *  - Always emit preconnect hints + the stylesheet link.
 */
export function buildFontLinks(
  aesthetic: AestheticDirection,
  fonts: string[] | null
): string {
  const specs = resolveSpecs(aesthetic, fonts)
  const familyParams = specs
    .map((spec) => `family=${encodeFontSpec(spec)}`)
    .join("&")
  const url = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`
  return [
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="${url}" rel="stylesheet">`,
  ].join("\n")
}

function resolveSpecs(
  aesthetic: AestheticDirection,
  fonts: string[] | null
): string[] {
  if (!fonts) return DEFAULT_FONTS_BY_DIRECTION[aesthetic]
  if (fonts.length === 0 || fonts.length > MAX_FONT_FAMILIES) {
    return DEFAULT_FONTS_BY_DIRECTION[aesthetic]
  }
  if (!fonts.every(validateFontSpec)) {
    return DEFAULT_FONTS_BY_DIRECTION[aesthetic]
  }
  return fonts
}

/**
 * Google Fonts css2 endpoint uses `+` for spaces in family names but
 * keeps `:`, `;`, `,`, `.`, `@`, and digits literal. Standard
 * encodeURIComponent would over-escape these.
 */
function encodeFontSpec(spec: string): string {
  return spec.replace(/ /g, "+")
}
