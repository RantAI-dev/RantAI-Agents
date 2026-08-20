/**
 * Selective VLM-at-answer (multimodal generation).
 *
 * Research consensus (2024-2026: UniDoc-Bench, ChartQAPro, TALENT, FRES) is that
 * feeding page/figure IMAGES to a vision model at generation time is worth it
 * only SELECTIVELY — for charts/plots/diagrams where the answer lives in pixels
 * the caption/OCR cannot recover — while tables and prose are cheaper and more
 * accurate as text. So we attach a figure crop to the LLM call ONLY when a
 * retrieved chunk is a trigger-kind figure, the model has vision, and the
 * feature is enabled. Everything else stays text-only.
 *
 * Gated by config: vlmAtAnswerEnabled, vlmAtAnswerTypes, vlmAtAnswerMaxImages.
 */
import { kb } from "@/lib/kb-runtime/runtime"

/** Minimal shape of a retrieved chunk this selector needs. */
export interface FigureCandidate {
  chunkType?: string | null
  assetKey?: string | null
  content: string
}

/** A source card as surfaced to the client: we match figures by assetKey and
 *  cite by the source's 1-based position. */
export interface SourceRef {
  assetKey?: string | null
}

export interface SelectedFigure {
  assetKey: string
  /** 1-based number matching the [N] Sources list / UI chip. */
  sourceNumber: number
  /** Printed caption (figure chunk content, e.g. "[Chart] Grafik 2.1 ..."). */
  caption: string
}

/** Figure kind inferred from the chunk content prefix written at ingest
 *  (figure-assets.ts: "[Chart] ..." for charts, "[Figure] ..." otherwise). */
function figureKind(content: string): "chart" | "figure" {
  return /^\s*\[chart\]/i.test(content) ? "chart" : "figure"
}

/** Does this retrieved chunk qualify for VLM-at-answer under `types`?
 *  `types` is a comma list; "figure" or "image" means "any figure". */
export function isTriggerFigure(c: FigureCandidate, types: string): boolean {
  if (c.chunkType !== "figure" || !c.assetKey) return false
  const set = new Set(
    types
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  )
  if (set.has("figure") || set.has("image")) return true // all figures
  return set.has(figureKind(c.content))
}

/**
 * Pick the trigger figures from the retrieved results, dedupe by asset, cap at
 * maxImages, and resolve each to its 1-based Source number so the model can tie
 * the image to a citation. Skips figures not present in `sources` (uncitable).
 */
export function selectVlmFigures(
  results: FigureCandidate[],
  sources: SourceRef[],
  opts: { types: string; maxImages: number },
): SelectedFigure[] {
  const numberByAsset = new Map<string, number>()
  sources.forEach((s, i) => {
    if (s.assetKey && !numberByAsset.has(s.assetKey)) numberByAsset.set(s.assetKey, i + 1)
  })

  const seen = new Set<string>()
  const out: SelectedFigure[] = []
  for (const r of results) {
    if (out.length >= opts.maxImages) break
    if (!isTriggerFigure(r, opts.types)) continue
    const assetKey = r.assetKey!
    if (seen.has(assetKey)) continue
    const sourceNumber = numberByAsset.get(assetKey)
    if (!sourceNumber) continue // not a cited source → can't reference cleanly
    seen.add(assetKey)
    out.push({ assetKey, sourceNumber, caption: r.content })
  }
  return out
}

/** AI-SDK-compatible content parts (kept dependency-light; caller wraps in a
 *  { role: "user", content } model message). */
export type FigurePart = { type: "text"; text: string } | { type: "image"; image: Buffer }

/**
 * Download each selected figure crop and build the multimodal content parts:
 * a short instruction tying each image to its [N] citation, followed by the
 * image itself. Best-effort per image (a failed download is skipped); returns
 * [] when nothing could be attached so the caller can fall back to text-only.
 */
export async function buildFigureParts(selected: SelectedFigure[]): Promise<FigurePart[]> {
  if (!selected.length) return []
  const blob = kb("blob")
  const parts: FigurePart[] = []
  for (const fig of selected) {
    try {
      const buf = await blob.download(fig.assetKey)
      parts.push({
        type: "text",
        text: `Gambar untuk sumber [${fig.sourceNumber}] (${fig.caption.replace(/\s+/g, " ").slice(0, 120)}). Baca isi gambar ini untuk menjawab, dan kutip sebagai [${fig.sourceNumber}].`,
      })
      parts.push({ type: "image", image: buf })
    } catch (err) {
      console.warn(
        `[VLM] skip figure ${fig.assetKey}: ${err instanceof Error ? err.message.slice(0, 100) : err}`,
      )
    }
  }
  return parts
}
