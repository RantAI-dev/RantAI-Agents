/**
 * Shared Mermaid theme variables used by both the client-side PPTX
 * rasterizer (`rendering/client/mermaid-to-png.ts`) and the server-side
 * docx rasterizer (`rendering/server/mermaid-to-svg.ts`).
 *
 * Keeping the visual contract in one file prevents silent drift when
 * a theme tweak is made on one surface but not the other.
 */

export const MERMAID_THEME_VARIABLES = {
  background: "#ffffff",
  primaryColor: "#ffffff",
  primaryTextColor: "#1c1c1c",
  primaryBorderColor: "#e2e1de",
  lineColor: "#6b6b6b",
  textColor: "#1c1c1c",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
} as const

export const MERMAID_THEME_VARIABLES_DARK = {
  background: "#0b0b0c",
  primaryColor: "#1a1a1d",
  primaryTextColor: "#e8e7e3",
  primaryBorderColor: "#2f2f33",
  lineColor: "#9a9a9a",
  textColor: "#e8e7e3",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
} as const

export const MERMAID_INIT_OPTIONS = {
  startOnLoad: false,
  theme: "base" as const,
  themeVariables: MERMAID_THEME_VARIABLES,
}

/**
 * Theme-aware mermaid init options. Use this in client renderers that need
 * to switch between light and dark; server-side rasterizers (DOCX export)
 * stay on the light variant since the document body is always white.
 */
export function getMermaidInitOptions(theme: "light" | "dark") {
  return {
    startOnLoad: false,
    theme: "base" as const,
    themeVariables:
      theme === "dark" ? MERMAID_THEME_VARIABLES_DARK : MERMAID_THEME_VARIABLES,
  }
}
