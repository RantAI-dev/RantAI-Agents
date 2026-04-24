/**
 * Client-side Mermaid diagram → PNG rasterization.
 *
 * Dynamically imports the mermaid library, initializes with the shared theme,
 * renders to SVG, and delegates to `svgToBase64Png` for canvas rasterization.
 * Browser-only.
 */

import { svgToBase64Png } from "./svg-to-png"

/**
 * Render Mermaid diagram code to a base64 PNG data URL.
 * Returns null on any failure (parse error, mermaid unavailable).
 */
export async function mermaidToBase64Png(
  diagramCode: string,
  width = 1200,
  height = 800,
): Promise<string | null> {
  try {
    const mermaid = await import("mermaid").then((m) => m.default)

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        background: "#ffffff",
        primaryColor: "#ffffff",
        primaryTextColor: "#1c1c1c",
        primaryBorderColor: "#e2e1de",
        lineColor: "#6b6b6b",
        textColor: "#1c1c1c",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
      },
    })

    const id = `pptx-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, diagramCode.trim())

    return svgToBase64Png(svg, width, height)
  } catch (error) {
    console.error("[mermaid-to-png] Failed:", error)
    return null
  }
}
