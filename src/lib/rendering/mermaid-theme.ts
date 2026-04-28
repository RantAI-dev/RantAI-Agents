/**
 * Shared Mermaid theme variables used by the client-side PPTX rasterizer
 * (`rendering/client/mermaid-to-png.ts`).
 */

const MERMAID_THEME_VARIABLES_LIGHT = {
  background: "#ffffff",
  primaryColor: "#ffffff",
  primaryTextColor: "#1c1c1c",
  primaryBorderColor: "#e2e1de",
  lineColor: "#6b6b6b",
  textColor: "#1c1c1c",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
} as const

const MERMAID_THEME_VARIABLES_DARK = {
  background: "#0b0b0c",
  primaryColor: "#1a1a1d",
  primaryTextColor: "#e8e7e3",
  primaryBorderColor: "#2f2f33",
  lineColor: "#9a9a9a",
  textColor: "#e8e7e3",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
} as const

/**
 * Theme-aware mermaid init options for client renderers that switch between
 * light and dark. The DOCX export path no longer exists — only PPTX uses
 * this module.
 */
export function getMermaidInitOptions(theme: "light" | "dark") {
  return {
    startOnLoad: false,
    theme: "base" as const,
    themeVariables:
      theme === "dark" ? MERMAID_THEME_VARIABLES_DARK : MERMAID_THEME_VARIABLES_LIGHT,
  }
}
