/**
 * Inline citation plumbing for RAG chat answers.
 *
 * The model cites facts with bracketed numbers (`[1]`, `[2]`) keyed to the
 * numbered Sources list it was given. We turn those into clickable chips that
 * scroll to the matching source card. To reuse the markdown renderer's own
 * anchor pipeline (instead of a bespoke remark plugin), we rewrite `[n]` into a
 * markdown link with a sentinel `#cite-…` href, then intercept that href when
 * rendering anchors.
 */

/**
 * Strip dead inline images from a RAG answer. MinerU excerpts carry markdown
 * like `![](images/<hash>.jpg)` pointing at paths inside its result ZIP — the
 * model parrots them into answers where they resolve to nothing and render as
 * broken image icons. Real figures surface via the Figures/Sources cards, so
 * any image whose src isn't an absolute URL (http/https/data/root-relative) is
 * noise and gets removed.
 */
export function stripDeadImages(content: string): string {
  if (!content) return content
  return content.replace(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g, (whole, src: string) => {
    return /^(https?:|data:|\/)/.test(src) ? whole : ""
  })
}

/** A figure source the model can embed inline via a `[figure:N]` marker. */
export interface EmbeddableFigure {
  n: number
  documentId: string
  assetKey: string
  title: string
  page?: number | null
}

/** Object key of every figure the model chose to embed inline in `content`. */
export function embeddedFigureNumbers(content: string): Set<number> {
  const out = new Set<number>()
  if (!content) return out
  for (const m of content.matchAll(/\[figure:(\d+)\]/g)) out.add(Number(m[1]))
  return out
}

/**
 * Replace `[figure:N]` markers with a markdown image of that figure, so the
 * model can place a chart/figure inline in its answer. Resolves N against the
 * numbered figure sources; unknown numbers are left as-is. Emitted as its own
 * block (blank lines around) so the renderer treats it as a standalone figure.
 */
export function embedFigures(content: string, figures: EmbeddableFigure[]): string {
  if (!content || !figures?.length) return content
  const byN = new Map(figures.map((f) => [f.n, f]))
  return content.replace(/\[figure:(\d+)\]/g, (whole, num) => {
    const f = byN.get(Number(num))
    if (!f) return whole
    const url = `/api/dashboard/files/${f.documentId}/asset?key=${encodeURIComponent(f.assetKey)}`
    const caption = `${f.title}${f.page != null ? ` (hal. ${f.page + 1})` : ""}`
    return `\n\n![${caption}](${url})\n\n`
  })
}

/** Figure numbers that appear as a plain `[N]` citation in the answer — i.e.
 *  figures the model referenced in prose, so they belong inline next to that
 *  reference rather than in the separate Figures strip. */
export function citedFigureNumbers(content: string, figures: EmbeddableFigure[]): Set<number> {
  const out = new Set<number>()
  if (!content || !figures?.length) return out
  const nums = new Set(figures.map((f) => f.n))
  for (const m of content.matchAll(/\[(\d{1,3})\](?!\()/g)) {
    const n = Number(m[1])
    if (nums.has(n)) out.add(n)
  }
  return out
}

/**
 * Auto-place each figure that's cited `[N]` in prose (but the model didn't
 * explicitly embed via `[figure:N]`) right after the paragraph containing its
 * first `[N]` reference — so the figure sits WITH the explanation that cites it
 * instead of being dumped in the Figures strip. Runs after embedFigures (which
 * consumes explicit `[figure:N]`) and before linkifyCitations (which turns `[N]`
 * into links). `alreadyEmbedded` = numbers the model embedded explicitly.
 */
export function autoEmbedFigures(
  content: string,
  figures: EmbeddableFigure[],
  alreadyEmbedded: Set<number>,
): string {
  if (!content || !figures?.length) return content
  let out = content
  for (const f of figures) {
    if (alreadyEmbedded.has(f.n)) continue
    const cite = new RegExp(`\\[${f.n}\\](?!\\()`)
    const m = cite.exec(out)
    if (!m) continue // not referenced in prose → leave it for the Figures strip
    const url = `/api/dashboard/files/${f.documentId}/asset?key=${encodeURIComponent(f.assetKey)}`
    const caption = `${f.title}${f.page != null ? ` (hal. ${f.page + 1})` : ""}`
    const img = `\n\n![${caption}](${url})\n\n`
    const after = m.index + m[0].length
    const nextBreak = out.indexOf("\n\n", after)
    const insertAt = nextBreak === -1 ? out.length : nextBreak
    out = out.slice(0, insertAt) + img + out.slice(insertAt)
  }
  return out
}

/** Stable id for a source card so a citation chip can scroll to it. */
export function citeAnchorId(messageId: string, n: number): string {
  return `cite-anchor-${messageId}-${n}`
}

const CITE_HREF_RE = /^#cite-(.+)-(\d+)$/

/** Parse a sentinel citation href back into its message id + number. */
export function parseCiteHref(href: string): { messageId: string; n: number } | null {
  const m = CITE_HREF_RE.exec(href)
  if (!m) return null
  return { messageId: m[1], n: Number(m[2]) }
}

/**
 * Rewrite `[n]` citation markers into markdown links (`[n](#cite-<msg>-<n>)`)
 * so the markdown renderer emits an anchor we can style as a chip. Only numbers
 * within 1..count are rewritten; markers already followed by `(` (real links)
 * are left alone. Fenced code blocks are skipped so code samples containing
 * `[0]`-style indexing aren't mangled.
 */
export function linkifyCitations(content: string, messageId: string, count: number): string {
  if (!content || count < 1) return content

  // Split on ``` fences; transform only the segments outside code fences
  // (even indices). This is a cheap guard, not a full markdown parse — inline
  // code spans are rare carriers of `[n]` and are left as-is.
  const segments = content.split(/(```[\s\S]*?```)/g)
  return segments
    .map((seg, i) => {
      if (i % 2 === 1) return seg // fenced code block — leave untouched
      return seg.replace(/\[(\d{1,3})\](?!\()/g, (whole, num) => {
        const n = Number(num)
        if (n < 1 || n > count) return whole
        return `[${n}](#cite-${messageId}-${n})`
      })
    })
    .join("")
}
