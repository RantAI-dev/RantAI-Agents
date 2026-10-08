/**
 * Inline figures for the v1 chat API.
 *
 * An answer cites a book figure by writing `[figure:N]`, where N is the 1-based
 * position of that figure in `sources`. Until now the client had to make a
 * second, separately authenticated request to fetch the image. With
 * `inline_figures: true` the image travels in the same response: as its own
 * SSE frame the moment the tag is complete, or in a `figures` array on the
 * non-streaming body.
 *
 * Three decisions worth knowing before changing this file:
 *
 * 1. Only CITED figures are sent. Retrieval routinely surfaces three figures
 *    for an answer that uses one; shipping all of them would triple the
 *    payload for images the reader never sees.
 *
 * 2. Figures are downscaled and re-encoded (WebP, long edge capped). SSE is
 *    text, so every byte pays a 33% base64 tax and nothing is cacheable. A
 *    full-resolution crop stays available from the asset route for a client
 *    that wants it on click.
 *
 * 3. The asset key is re-checked against its document even though both come
 *    from our own retrieval. The check is one string comparison; the failure
 *    it prevents is reading an arbitrary object out of the bucket because some
 *    future caller passed a source it did not get from retrieval.
 */

export type FigureSourceLike = {
  title: string
  section?: string | null
  documentId?: string | null
  assetKey?: string | null
  page?: number | null
  chunkType?: string | null
}

export interface InlineFigure {
  /** 1-based position in `sources`; matches the `[figure:N]` tag in the text. */
  n: number
  title: string
  section: string | null
  /** Zero-based page index, as in `sources`. */
  page: number | null
  mime: string
  width: number | null
  height: number | null
  /** Size of the encoded image before base64. */
  bytes: number
  /** Base64 image data, no `data:` prefix. */
  data: string
}

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function inlineFigureLimits(env: NodeJS.ProcessEnv = process.env) {
  return {
    /** Most figures inlined into one answer. A runaway `[figure:5]…[figure:112]`
     *  loop has been observed from a fine-tuned adapter; without a cap that is
     *  a hundred object reads and megabytes of base64 for one reply. */
    maxPerAnswer: positiveInt(env.AGENT_API_INLINE_FIGURE_MAX, 4),
    /** Long-edge cap, in pixels, for the re-encoded image. */
    maxEdgePx: positiveInt(env.AGENT_API_INLINE_FIGURE_MAX_PX, 720),
    /** When re-encoding is unavailable the original is sent only below this
     *  size; a multi-megabyte PNG must not ride the chat stream. */
    maxRawBytes: positiveInt(env.AGENT_API_INLINE_FIGURE_MAX_RAW_BYTES, 400_000),
  }
}

const FIGURE_TAG = /\[figure:\s*(\d+)\]/g
/** Longest tag we will wait for across chunk boundaries (`[figure: 12345]`). */
const TAG_LOOKBEHIND = 24

/** Figure numbers cited in a finished text, first-citation order, no repeats. */
export function citedFigureNumbers(text: string): number[] {
  const seen = new Set<number>()
  for (const m of text.matchAll(FIGURE_TAG)) seen.add(Number(m[1]))
  return [...seen]
}

/**
 * Incremental `[figure:N]` detector for a streamed answer.
 *
 * The model's tokens do not respect tag boundaries — `[figure:` and `3]`
 * arrive in different deltas — so matching each delta on its own misses most
 * tags. This keeps the running text and reports a number the first time its
 * tag is complete, exactly once.
 */
export function createFigureTagScanner() {
  let text = ""
  let scanFrom = 0
  const reported = new Set<number>()

  return {
    push(delta: string): number[] {
      text += delta
      const fresh: number[] = []
      const re = new RegExp(FIGURE_TAG.source, "g")
      re.lastIndex = scanFrom
      let consumed = scanFrom
      for (let m = re.exec(text); m; m = re.exec(text)) {
        consumed = m.index + m[0].length
        const n = Number(m[1])
        if (!reported.has(n)) {
          reported.add(n)
          fresh.push(n)
        }
      }
      // Resume just before the tail so a tag split across deltas is still seen,
      // but never before a tag that was already consumed.
      scanFrom = Math.max(consumed, text.length - TAG_LOOKBEHIND)
      return fresh
    },
  }
}

/** True when `assetKey` is a figure asset stored under `documentId`. */
export function isFigureAssetOfDocument(assetKey: string, documentId: string): boolean {
  return (
    documentId.length > 0 &&
    assetKey.startsWith("documents/") &&
    assetKey.includes(`/${documentId}/assets/`) &&
    !assetKey.includes("..")
  )
}

export type EncodedImage = { mime: string; width: number | null; height: number | null; buffer: Buffer }

/** Downscale to `maxEdgePx` on the long edge and re-encode as WebP. */
export async function encodeForInline(original: Buffer, maxEdgePx: number): Promise<EncodedImage> {
  const sharp = (await import("sharp")).default
  const { data, info } = await sharp(original)
    .rotate()
    .resize({ width: maxEdgePx, height: maxEdgePx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  return { mime: "image/webp", width: info.width, height: info.height, buffer: data }
}

export interface FigureLoaderDeps {
  download: (assetKey: string) => Promise<Buffer>
  encode?: (original: Buffer, maxEdgePx: number) => Promise<EncodedImage>
  limits?: ReturnType<typeof inlineFigureLimits>
  warn?: (message: string) => void
}

/**
 * Resolve `[figure:n]` to an inline image, or `null` when it should not be
 * sent. Never throws: a figure that fails to load must cost the reader one
 * missing picture, not the rest of the answer.
 */
export async function loadInlineFigure(
  n: number,
  sources: FigureSourceLike[],
  deps: FigureLoaderDeps,
): Promise<InlineFigure | null> {
  const source = sources[n - 1]
  if (!source || source.chunkType !== "figure") return null
  const { documentId, assetKey } = source
  if (!documentId || !assetKey || !isFigureAssetOfDocument(assetKey, documentId)) return null

  const limits = deps.limits ?? inlineFigureLimits()
  const warn = deps.warn ?? ((m: string) => console.warn(m))

  let original: Buffer
  try {
    original = await deps.download(assetKey)
  } catch (err) {
    warn(`[V1 API] inline figure ${n}: download failed — ${err instanceof Error ? err.message.slice(0, 120) : err}`)
    return null
  }

  let image: EncodedImage
  try {
    image = await (deps.encode ?? encodeForInline)(original, limits.maxEdgePx)
  } catch (err) {
    if (original.length > limits.maxRawBytes) {
      warn(`[V1 API] inline figure ${n}: re-encode failed and original is ${original.length} bytes — skipped`)
      return null
    }
    warn(`[V1 API] inline figure ${n}: re-encode failed, sending original — ${err instanceof Error ? err.message.slice(0, 120) : err}`)
    image = { mime: "image/png", width: null, height: null, buffer: original }
  }

  return {
    n,
    title: source.title,
    section: source.section ?? null,
    page: source.page ?? null,
    mime: image.mime,
    width: image.width,
    height: image.height,
    bytes: image.buffer.length,
    data: image.buffer.toString("base64"),
  }
}

/**
 * Per-response figure feed. `onDelta` returns the figures whose tags that
 * delta completed; `forText` does the same for a finished, non-streamed
 * answer. Both honour the per-answer cap.
 */
export function createInlineFigureFeed(sources: FigureSourceLike[], deps: FigureLoaderDeps) {
  const limits = deps.limits ?? inlineFigureLimits()
  const scanner = createFigureTagScanner()
  let sent = 0

  const load = async (numbers: number[]): Promise<InlineFigure[]> => {
    const out: InlineFigure[] = []
    for (const n of numbers) {
      if (sent >= limits.maxPerAnswer) break
      const fig = await loadInlineFigure(n, sources, { ...deps, limits })
      if (fig) {
        sent++
        out.push(fig)
      }
    }
    return out
  }

  return {
    onDelta: (delta: string) => load(scanner.push(delta)),
    forText: (text: string) => load(citedFigureNumbers(text)),
  }
}

export type InlineFigureFeed = ReturnType<typeof createInlineFigureFeed>
