/**
 * Server-side Mermaid diagram → SVG string.
 *
 * Shims a jsdom window as globals around a mermaid.render call, then restores
 * the previous globals. Caller rasterizes the SVG via `svgToPng` + `resizeSvg`
 * if a raster is needed.
 *
 * Concurrency note: mermaid is a global singleton; the window swap + restore
 * in the finally block keeps the Node process from leaking a stale window
 * between calls. Serialized per call via JS single-threaded event loop.
 */

import "server-only"
import { JSDOM } from "jsdom"
import { MERMAID_INIT_OPTIONS } from "../mermaid-theme"

const SHIM_KEYS = ["window", "document", "DOMParser", "navigator"] as const
type ShimKey = (typeof SHIM_KEYS)[number]

type Snapshot = {
  descriptor: PropertyDescriptor | undefined
  had: boolean
}

function captureAndAssign(key: ShimKey, value: unknown): Snapshot {
  const target = globalThis as unknown as Record<string, unknown>
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
  const had = key in target
  // Use defineProperty because some globals (e.g. Node's `navigator`) are
  // installed as getter-only accessors and a plain assignment throws.
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  })
  return { descriptor, had }
}

function restore(key: ShimKey, snap: Snapshot) {
  if (snap.descriptor) {
    Object.defineProperty(globalThis, key, snap.descriptor)
  } else if (snap.had) {
    // The key existed but had no descriptor we could read; leave as-is.
  } else {
    delete (globalThis as unknown as Record<string, unknown>)[key]
  }
}

export async function mermaidToSvg(code: string): Promise<string> {
  const trimmed = code.trim()
  if (!trimmed) throw new Error("[mermaid-to-svg] empty code")

  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><div id="mm-host"></div></body></html>`,
    { pretendToBeVisual: true },
  )

  const shims: Record<ShimKey, unknown> = {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    navigator: dom.window.navigator,
  }

  const snapshots: Partial<Record<ShimKey, Snapshot>> = {}
  for (const key of SHIM_KEYS) {
    snapshots[key] = captureAndAssign(key, shims[key])
  }

  // jsdom does not implement SVG layout methods. Mermaid needs text width/height
  // for its dagre layout and calls `getBBox` / `getComputedTextLength` on every
  // label. We stub them with reasonable fixed metrics so the render can finish;
  // the resulting SVG is self-describing and downstream rasterizers re-measure
  // via their own renderer. Patched on the jsdom window's prototypes so they
  // unwind with `dom.window.close()` and never leak into the host Node process.
  const SVGElementProto = dom.window.SVGElement?.prototype as
    | { getBBox?: () => DOMRect }
    | undefined
  const SVGTextContentProto = (dom.window as unknown as { SVGTextContentElement?: { prototype: { getComputedTextLength?: () => number } } })
    .SVGTextContentElement?.prototype
  if (SVGElementProto && !SVGElementProto.getBBox) {
    SVGElementProto.getBBox = function getBBox(this: { textContent?: string | null }) {
      const text = this.textContent ?? ""
      return {
        x: 0,
        y: 0,
        width: text.length * 8,
        height: 16,
        top: 0,
        right: text.length * 8,
        bottom: 16,
        left: 0,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
  }
  if (SVGTextContentProto && !SVGTextContentProto.getComputedTextLength) {
    SVGTextContentProto.getComputedTextLength = function (this: { textContent?: string | null }) {
      return (this.textContent ?? "").length * 8
    }
  }

  try {
    const mermaid = (await import("mermaid")).default
    // `securityLevel: "loose"` bypasses mermaid's internal DOMPurify sanitize
    // step. DOMPurify binds to the global window at module load time; after
    // the first render we close the jsdom window and all subsequent sanitize
    // calls silently return an empty string. Since our diagram source is
    // author-controlled (LLM-generated artifact code, not arbitrary user
    // HTML) skipping sanitize is acceptable and lets the module render
    // reliably across multiple calls.
    mermaid.initialize({ ...MERMAID_INIT_OPTIONS, securityLevel: "loose" })

    const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const host = dom.window.document.getElementById("mm-host") ?? undefined
    const { svg } = await mermaid.render(id, trimmed, host as unknown as HTMLElement | undefined)
    return svg
  } finally {
    for (const key of SHIM_KEYS) {
      const snap = snapshots[key]
      if (snap) restore(key, snap)
    }
    dom.window.close()
  }
}
