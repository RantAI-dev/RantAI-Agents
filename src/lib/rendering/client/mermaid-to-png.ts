/**
 * Client-side Mermaid diagram → PNG rasterization.
 *
 * Dynamically imports the mermaid library, initializes with the shared theme,
 * renders to SVG, and delegates to `svgToBase64Png` for canvas rasterization.
 * Browser-only.
 */

import { svgToBase64Png } from "./svg-to-png"
import { MERMAID_INIT_OPTIONS } from "../mermaid-theme"

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

    mermaid.initialize(MERMAID_INIT_OPTIONS)

    const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, diagramCode.trim())

    return svgToBase64Png(svg, width, height)
  } catch (error) {
    console.error("[mermaid-to-png] Failed:", error)
    return null
  }
}
