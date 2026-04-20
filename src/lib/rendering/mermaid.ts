/**
 * Mermaid diagram -> PNG rendering for artifact export pipelines.
 *
 * Runs client-side — requires a DOM for `mermaid.render` to attach its
 * SVG output. The returned data URL can be embedded directly into PPTX
 * (via pptxgenjs) or any other container that accepts base64 PNG.
 */

import { renderSvgToPng } from "./svg"

/**
 * Render a Mermaid diagram to a base64 PNG data URL.
 *
 * Returns null on any failure (invalid source, mermaid crash, canvas
 * error) so callers can fall back to a placeholder without breaking
 * the overall export.
 *
 * @param diagramCode - Raw Mermaid source (e.g. `flowchart TD\n  A --> B`)
 * @param width       - Target width in pixels (default 1200)
 * @param height      - Target height in pixels (default 800)
 * @returns `data:image/png;base64,...` or `null`
 */
export async function renderMermaidToPng(
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

    const id = `render-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, diagramCode.trim())

    return renderSvgToPng(svg, width, height)
  } catch (error) {
    console.error("[rendering/mermaid] Render failed:", error)
    return null
  }
}
