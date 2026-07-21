/**
 * Attach source page numbers to text chunks (multimodal RAG).
 *
 * Layout parsers like MinerU know each text block's page, but we chunk the
 * flattened markdown (better formatting for embeddings), which loses page
 * boundaries. This re-attaches a page to each chunk by matching the chunk's
 * leading text against the parser's ordered per-page blocks (pageMap). It's a
 * best-effort, monotonic scan: chunks and blocks are both in document order, so
 * a forward cursor keeps it cheap and resistant to repeated phrases.
 */

/** Strip markdown noise and collapse whitespace so snippets compare cleanly. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*#>|_~[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function assignChunkPages<
  T extends { content: string; metadata: { page?: number } },
>(chunks: T[], pageMap?: Array<{ page: number; text: string }>): T[] {
  if (!pageMap?.length) return chunks

  const blocks = pageMap
    .map((b) => ({ page: b.page, norm: normalize(b.text) }))
    .filter((b) => b.norm.length >= 10)
  if (!blocks.length) return chunks

  let cursor = 0
  // Running page, so a chunk that fails to match still inherits the page of the
  // chunk before it (document order) — guarantees every chunk gets a page once
  // a pageMap exists, instead of leaving gaps. Seeds from the first block.
  let lastPage = blocks[0].page

  return chunks.map((chunk) => {
    // Figure chunks already carry an exact page — never override.
    if (chunk.metadata.page != null) {
      lastPage = chunk.metadata.page
      return chunk
    }

    const key = normalize(chunk.content).slice(0, 24)

    const scan = (start: number, end: number): number => {
      if (key.length < 10) return -1
      for (let i = start; i < end; i++) {
        if (blocks[i].norm.includes(key) || key.includes(blocks[i].norm.slice(0, 24))) {
          return i
        }
      }
      return -1
    }

    // Forward from the cursor first (document order), then wrap to the head.
    let found = scan(cursor, blocks.length)
    if (found === -1) found = scan(0, cursor)

    const page = found === -1 ? lastPage : blocks[found].page
    if (found !== -1) cursor = found
    lastPage = page

    return { ...chunk, metadata: { ...chunk.metadata, page } }
  })
}
