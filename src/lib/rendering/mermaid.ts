/**
 * Mermaid diagram -> PNG rendering for artifact export pipelines.
 *
 * Runs client-side — requires a DOM for `mermaid.render` to attach its
 * SVG output. The returned data URL can be embedded directly into PPTX
 * (via pptxgenjs) or any other container that accepts base64 PNG.
 *
 * Cache: before rendering locally, we hash the inputs and ask the
 * server for a pre-rendered PNG. On miss we render locally and POST
 * the result back (fire-and-forget). Any cache error falls through to
 * a local render — the cache MUST NOT block the export path.
 */

import { hashMermaidInput } from "./mermaid-cache"
import {
  MERMAID_VERSION,
  MERMAID_THEME_KEY,
  MERMAID_CACHE_MAX_BYTES,
} from "./mermaid-constants"
import { renderSvgToPng } from "./svg"

const CACHE_API = "/api/rendering/mermaid"

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
  const trimmed = diagramCode.trim()
  const hash = await hashMermaidInput({
    source: trimmed,
    theme: MERMAID_THEME_KEY,
    width,
    height,
    mermaidVersion: MERMAID_VERSION,
  })

  // Cache hit path. Any failure (network, auth, server error) falls
  // through silently to the local render.
  const cached = await getMermaidCacheEntry(hash)
  if (cached) return cached

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
    const { svg } = await mermaid.render(id, trimmed)
    const pngDataUrl = await renderSvgToPng(svg, width, height)

    // Fire-and-forget cache write. Never await.
    void postMermaidCacheEntry({
      hash,
      pngDataUrl,
      width,
      height,
      mermaidVersion: MERMAID_VERSION,
    })

    return pngDataUrl
  } catch (error) {
    console.error("[rendering/mermaid] Render failed:", error)
    return null
  }
}

/**
 * Look up a cached render from the server. Returns the data URL on
 * hit, null on miss OR any error — the caller treats both the same
 * way (falls through to local render).
 */
async function getMermaidCacheEntry(hash: string): Promise<string | null> {
  try {
    const res = await fetch(`${CACHE_API}?hash=${encodeURIComponent(hash)}`)
    if (!res.ok) return null
    const body = (await res.json()) as { pngDataUrl?: unknown }
    return typeof body.pngDataUrl === "string" ? body.pngDataUrl : null
  } catch (err) {
    console.warn("[mermaid-cache] lookup failed:", err)
    return null
  }
}

/**
 * Store a rendered PNG in the cache.
 *
 * TODO: swap to `navigator.sendBeacon` if this becomes a hot path —
 * sendBeacon survives page-unload but is fire-and-forget only (no
 * response inspection). Current `fetch` is fine while the render runs
 * during an explicit download button click (page will not unload).
 */
async function postMermaidCacheEntry(params: {
  hash: string
  pngDataUrl: string
  width: number
  height: number
  mermaidVersion: string
}): Promise<void> {
  const bytes = estimateBase64Bytes(params.pngDataUrl)
  if (bytes > MERMAID_CACHE_MAX_BYTES) {
    console.warn(
      `[mermaid-cache] skip store, size=${bytes} bytes exceeds cap=${MERMAID_CACHE_MAX_BYTES}`,
    )
    return
  }
  try {
    await fetch(CACHE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
  } catch (err) {
    console.warn("[mermaid-cache] store failed:", err)
  }
}

/**
 * Approximate the decoded byte length of a base64 data URL without
 * actually decoding. Accurate enough (±2 bytes for padding) to decide
 * whether we're over `MERMAID_CACHE_MAX_BYTES`.
 */
function estimateBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",")
  if (commaIdx < 0) return 0
  const b64 = dataUrl.slice(commaIdx + 1)
  return Math.floor((b64.length * 3) / 4)
}
