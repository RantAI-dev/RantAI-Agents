/**
 * rantai-kb's per-document structure, read for chapter-title extraction on
 * knowledge bases the route table has switched (GET /api/v1/mapel/chapters,
 * second-preference source).
 *
 * What 0.6.0 actually exposes for this (kb-api-0.6.0.md, verified live
 * 2026-11-19 on the UGM corpus):
 *
 *  - `GET /v1/documents?externalRef=<localId>` finds the KB copy of a local
 *    Document — the migration ingested every original with
 *    `externalRef = <local Document.id>`.
 *  - `GET /v1/documents/:id/structure` answers `pages` (`number`, 0-based,
 *    and `ocrText` — the page's stored text, recorded only for pages the
 *    ingest OCR'd) plus the chunk→page map. It carries NO outline and NO
 *    titles; a chunk's `section` exists only on `/v1/search` results, and
 *    for this corpus it is null (the books have text layers, so no page
 *    ever got `ocrText` either). So today this source yields nothing and
 *    the caller falls through to the chunk headings — but a scanned book,
 *    whose pages do carry `ocrText`, gets real titles from here.
 */
import { remoteKbConfig } from "./routing"

interface KbDocumentSummary {
  id: string
  knowledgeBaseIds?: string[] | null
}

interface KbStructureResponse {
  pages?: Array<{ number: number; ocrText?: string | null }> | null
}

/** One page's stored text, in page order — the units a heading scan reads. */
export interface RemoteTextUnit {
  text: string
  /** 0-based, rantai-kb pages are 0-based like every page in this API. */
  page: number
}

async function kbGet<T>(path: string, apiKey: string, baseUrl: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = new Headers()
    headers.set("authorization", `Bearer ${apiKey}`)
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`KB remote ${res.status} on ${path}: ${text.slice(0, 200)}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The OCR'd page texts of the KB copy of `localDocumentId`, or null when
 * the document has no KB copy in `remoteKbIds`, or no page text exists.
 * Throws on transport errors — the caller falls through to the next
 * chapter-title source, never fails the request.
 */
export async function remoteDocumentTexts(
  localDocumentId: string,
  remoteKbIds: string[],
): Promise<RemoteTextUnit[] | null> {
  const cfg = remoteKbConfig()
  if (!cfg) return null

  const listPath =
    `/v1/documents?limit=5&externalRef=${encodeURIComponent(localDocumentId)}` +
    remoteKbIds.map((id) => `&knowledgeBaseIds=${encodeURIComponent(id)}`).join("")
  const list = await kbGet<{ documents?: KbDocumentSummary[] | null }>(listPath, cfg.apiKey, cfg.baseUrl, cfg.timeoutMs)
  // The KB is tenant-scoped by its key; keep only the copy that lives in the
  // knowledge bases this group was routed to.
  const doc = (list.documents ?? []).find((d) =>
    (d.knowledgeBaseIds ?? []).some((kbId) => remoteKbIds.includes(kbId)),
  )
  if (!doc) return null

  const structure = await kbGet<KbStructureResponse>(
    `/v1/documents/${encodeURIComponent(doc.id)}/structure`,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.timeoutMs,
  )
  const units = (structure.pages ?? [])
    .filter((p) => typeof p.ocrText === "string" && p.ocrText!.length > 0)
    .map((p) => ({ text: p.ocrText as string, page: p.number }))
  return units.length > 0 ? units : null
}
