/**
 * IKAT-Bench step 2 — turn raw OCR into an anchored chunk corpus.
 *
 * The unit of ground truth is the BLOCK SEQUENCE: each page's markdown is split
 * into ordered blocks, and a figure block keeps its position among the text
 * blocks exactly as the book set it. From that we derive, for every figure:
 *
 *   anchorIndex — its position in the document's reading order
 *   ctx         — the adjacent prose (the textbook authors' own placement label)
 *   anchorChunk — the chunk whose span covers the anchor
 *
 * `ctx` is what the placement metric scores against, so the whole benchmark
 * rests on this file being faithful to reading order. Chunking therefore splits
 * on block boundaries only — never mid-block — so a chunk's span is always an
 * exact, contiguous run of blocks and an anchor can never fall "between" chunks.
 *
 * Usage: bun tests/bench-kb/src/ikat/build-corpus.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import type { RawExtraction } from "./extract-corpus"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const RAW_DIR = path.join(BENCH_ROOT, "corpus", "raw")
const OUT_DIR = path.join(BENCH_ROOT, "corpus", "built")

/** Target chunk size in characters. Matches production's rough scale. */
const CHUNK_CHARS = 1200

// ── Block model ────────────────────────────────────────────────────────────

export interface Block {
  /** Position in the document's reading order. This is the anchor coordinate. */
  index: number
  page: number
  kind: "text" | "figure"
  /** Prose for text blocks; "" for figures. */
  text: string
  /** Figure id for figure blocks (matches RawExtraction.figures[].id). */
  figureId?: string
}

export interface Chunk {
  id: string
  docSlug: string
  /** Inclusive block range this chunk covers. */
  fromBlock: number
  toBlock: number
  page: number
  text: string
}

export interface FigureRecord {
  id: string
  docSlug: string
  page: number
  assetFile: string
  /** Normalized [x0,y0,x1,y1] on the page. */
  bbox: [number, number, number, number]
  /** Fraction of the page area the crop covers. Used to drop page furniture. */
  area: number
  /**
   * True when the crop is almost certainly page furniture rather than a
   * pedagogical figure: a tiny icon, a full-bleed background, or a banner
   * pinned to the very top/bottom of the page (chapter headers, footers).
   *
   * Curriculum books are heavily decorated, and without this the benchmark
   * fills up with questions like "what colour is the circle around the chapter
   * number" — which are figure-dependent in the literal sense and worthless as
   * a measure of tutoring quality.
   */
  decorative: boolean
  /** Reading-order index of the figure block. */
  anchorIndex: number
  /** Adjacent prose — the layout-gold context used by the placement metric. */
  ctx: string
  /** Printed caption when the book has one, else null. */
  caption: string | null
  /** Id of the chunk covering `anchorIndex`. */
  anchorChunkId: string | null
}

export interface BuiltDoc {
  slug: string
  title: string
  pageCount: number
  blocks: Block[]
  chunks: Chunk[]
  figures: FigureRecord[]
}

// ── Parsing page markdown into ordered blocks ──────────────────────────────

const IMG_RE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g

/**
 * Split one page's markdown into ordered blocks, keeping the inline figure
 * markers as figure blocks positioned exactly where they appeared.
 *
 * Everything hinges on preserving order here, so we walk the string once and
 * emit text spans and figure markers in the order encountered rather than
 * extracting images separately (which is precisely the bug in production).
 */
export function parsePageBlocks(
  markdown: string,
  page: number,
  startIndex: number,
  knownFigureIds: Set<string>,
): Block[] {
  const blocks: Block[] = []
  let idx = startIndex
  let cursor = 0

  const pushText = (raw: string) => {
    for (const para of raw.split(/\n\s*\n/)) {
      const t = para.trim()
      if (t) blocks.push({ index: idx++, page, kind: "text", text: t })
    }
  }

  IMG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IMG_RE.exec(markdown)) !== null) {
    pushText(markdown.slice(cursor, m.index))
    const figId = m[1]
    // Only treat it as a figure block if it resolves to an extracted asset;
    // an unresolvable marker is dead markdown, not a figure.
    if (knownFigureIds.has(figId)) {
      blocks.push({ index: idx++, page, kind: "figure", text: "", figureId: figId })
    }
    cursor = m.index + m[0].length
  }
  pushText(markdown.slice(cursor))
  return blocks
}

// ── Caption detection ──────────────────────────────────────────────────────

const CAPTION_RE = /^(gambar|tabel|foto|diagram|grafik|bagan|ilustrasi)\b/i

/**
 * A printed caption is the adjacent text block that announces the figure.
 * Looked for after the figure first (Indonesian textbooks caption below), then
 * before. Returns null when the book simply did not print one — the common case,
 * and the reason caption-matching retrieval performs poorly.
 */
export function findCaption(blocks: Block[], figureBlockIdx: number): string | null {
  const at = blocks.findIndex((b) => b.index === figureBlockIdx)
  if (at === -1) return null
  for (const j of [at + 1, at - 1]) {
    const b = blocks[j]
    if (b?.kind === "text" && CAPTION_RE.test(b.text.trim())) return b.text.trim().slice(0, 200)
  }
  return null
}

/** Adjacent prose around the anchor: the layout-gold placement label. */
export function contextFor(blocks: Block[], figureBlockIdx: number, radius = 1): string {
  const at = blocks.findIndex((b) => b.index === figureBlockIdx)
  if (at === -1) return ""
  const parts: string[] = []
  for (let j = at - radius; j <= at + radius; j++) {
    const b = blocks[j]
    if (b && b.kind === "text" && b.text) parts.push(b.text)
  }
  return parts.join(" ").slice(0, 1500)
}

// ── Chunking on block boundaries ───────────────────────────────────────────

/**
 * Group consecutive TEXT blocks into chunks of roughly CHUNK_CHARS.
 *
 * Splits only at block boundaries so every chunk covers a contiguous, exact
 * block range — that is what lets an anchor be mapped to precisely one chunk.
 * A figure block never lands inside a chunk's text; it is located by its index
 * falling within [fromBlock, toBlock].
 */
export function chunkBlocks(blocks: Block[], docSlug: string): Chunk[] {
  const chunks: Chunk[] = []
  let buf: Block[] = []
  let size = 0
  let n = 0

  const flush = () => {
    if (!buf.length) return
    chunks.push({
      id: `${docSlug}::c${n++}`,
      docSlug,
      fromBlock: buf[0].index,
      toBlock: buf[buf.length - 1].index,
      page: buf[0].page,
      text: buf.map((b) => b.text).join("\n\n"),
    })
    buf = []
    size = 0
  }

  for (const b of blocks) {
    if (b.kind !== "text") continue
    if (size + b.text.length > CHUNK_CHARS && buf.length) flush()
    buf.push(b)
    size += b.text.length
  }
  flush()
  return chunks
}

/**
 * Classify a crop as page furniture from its geometry alone.
 *
 * Geometry-only on purpose: it is cheap, deterministic, reproducible from the
 * cached extraction, and — importantly for baseline fairness — it is applied
 * identically to every system under test, so it cannot advantage ours.
 *
 * Thresholds: < 2% of the page is an icon/bullet; > 85% is a full-page
 * background or a scanned spread; a band sitting entirely in the top or bottom
 * 12% of the page is a running header/footer.
 */
export function isDecorative(bbox: [number, number, number, number]): boolean {
  const [x0, y0, x1, y1] = bbox
  const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  if (area < 0.02) return true
  if (area > 0.85) return true
  if (y1 <= 0.12 || y0 >= 0.88) return true
  return false
}

/** The chunk whose block range covers `anchorIndex`, or the nearest preceding one. */
export function chunkForAnchor(chunks: Chunk[], anchorIndex: number): string | null {
  let best: Chunk | null = null
  for (const c of chunks) {
    if (anchorIndex >= c.fromBlock && anchorIndex <= c.toBlock) return c.id
    if (c.toBlock < anchorIndex && (!best || c.toBlock > best.toBlock)) best = c
  }
  return best?.id ?? null
}

// ── Build ──────────────────────────────────────────────────────────────────

export function buildDoc(raw: RawExtraction): BuiltDoc {
  const figIds = new Set(raw.figures.map((f) => f.id))
  const blocks: Block[] = []
  for (const p of raw.pages) {
    blocks.push(...parsePageBlocks(p.markdown, p.index, blocks.length, figIds))
  }

  const chunks = chunkBlocks(blocks, raw.slug)
  const byId = new Map(raw.figures.map((f) => [f.id, f]))

  const figures: FigureRecord[] = []
  for (const b of blocks) {
    if (b.kind !== "figure" || !b.figureId) continue
    const src = byId.get(b.figureId)
    if (!src) continue
    const [x0, y0, x1, y1] = src.bbox
    figures.push({
      // A figure id repeats across pages in Mistral output ("img-0.jpeg" on many
      // pages), so the corpus-unique key must include the page.
      id: `${raw.slug}::p${b.page}::${b.figureId}`,
      docSlug: raw.slug,
      page: b.page,
      assetFile: src.assetFile,
      bbox: src.bbox,
      area: Math.max(0, x1 - x0) * Math.max(0, y1 - y0),
      decorative: isDecorative(src.bbox),
      anchorIndex: b.index,
      ctx: contextFor(blocks, b.index),
      caption: findCaption(blocks, b.index),
      anchorChunkId: chunkForAnchor(chunks, b.index),
    })
  }

  return {
    slug: raw.slug,
    title: raw.title,
    pageCount: raw.pageCount,
    blocks,
    chunks,
    figures,
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json")).sort()
  if (!files.length) {
    console.error(`[ikat] no raw extractions in ${RAW_DIR} — run extract-corpus.ts first`)
    process.exit(1)
  }

  let totalFigs = 0
  let withCaption = 0
  let anchored = 0
  let decorative = 0
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf-8")) as RawExtraction
    const doc = buildDoc(raw)
    fs.writeFileSync(path.join(OUT_DIR, `${doc.slug}.json`), JSON.stringify(doc, null, 2))
    totalFigs += doc.figures.length
    withCaption += doc.figures.filter((x) => x.caption).length
    anchored += doc.figures.filter((x) => x.anchorChunkId).length
    decorative += doc.figures.filter((x) => x.decorative).length
    console.log(
      `[ikat] built ${doc.slug}: ${doc.blocks.length} blocks, ${doc.chunks.length} chunks, ` +
        `${doc.figures.length} figures (${doc.figures.filter((x) => x.caption).length} captioned)`,
    )
  }
  // These two rates are reported in the paper: they quantify how little the
  // caption-matching approach has to work with, and how completely the anchor
  // survives by comparison.
  const pct = (n: number) => (totalFigs ? ((100 * n) / totalFigs).toFixed(1) : "0.0")
  console.log(
    `[ikat] corpus: ${files.length} docs, ${totalFigs} figures — ` +
      `printed caption: ${withCaption} (${pct(withCaption)}%), anchored to a chunk: ${anchored} (${pct(anchored)}%), ` +
      `page furniture: ${decorative} (${pct(decorative)}%)`,
  )
}

if (import.meta.main) main()
