/**
 * rantai-kb 0.6.0 retrieval, mapped onto the in-process engine's shapes.
 *
 * The two v1 call sites (chat and Latihan) read retrieval through the hybrid
 * result type the old engine returns — `HybridRetrievalResult` from
 * lib/rag/retriever — because formatHybridContextForPrompt, groundingOf, the
 * ragSources mapping, selectedFigureNumbers and practice/passages.ts all
 * consume that shape. This module's whole job is to answer in it, so those
 * call sites work unchanged whichever engine ran.
 *
 * Field mapping notes (rantai-kb openapi 0.6.0: SearchResponseDto/ChunkDto/
 * SourceDto/RetrievalDto):
 *
 *  - vectorScore ← `retrieval.rerankScore` when the engine reranked, else
 *    `similarity` (see scaleOf: the embedder's similarity does not separate
 *    in-book from off-book questions). `scoreScale` tells the caller which
 *    threshold applies. `fusedScore` still fills `combinedScore` when present.
 *  - page: rantai-kb is 0-based ("0-based like every other `page` in the
 *    API"), and so is the old engine's (extractors/types.ts: "0-based page
 *    index"; the dashboard renders `page + 1` as "hal. N"). Both bases are
 *    the same, so pages pass through unchanged — the conversion is the
 *    identity. If rantai-kb ever changes base, this is the single place to
 *    fix.
 *  - chunkIndex/anchorChunkIndex are not exposed by the remote API; sources
 *    carry null and results carry a placeholder 0. Nothing on the routed call
 *    paths reads them (grounding, figure selection, passages, prompt
 *    formatting all use content/chunkType/assetKey/page/vectorScore).
 *  - figureSelected ← retrieval.arms contains "figure" (the direct figure
 *    arm), isNeighbor ← arms contains "neighbour": the remote equivalents of
 *    the local flags.
 *  - sources are marked kbOrigin: "remote" so the inline-figure loader knows
 *    to fetch bytes from rantai-kb's assets route instead of this app's S3.
 *    The marker is its own field — never overloading assetKey.
 */
import type { HybridRetrievalResult } from "@/lib/rag/retriever"
import type { HybridSearchResult, HybridSearchStats } from "@/lib/rag/hybrid-search"
import { remoteKbConfig } from "./routing"

export interface RemoteHybridOptions {
  /** rantai-kb knowledge base ids to search (from the route table only). */
  remoteKbIds: string[]
  maxChunks?: number
}

/** The remote answer in the old engine's shape, plus the fields only the
 *  remote engine can report. */
export interface RemoteHybridResult extends HybridRetrievalResult {
  sources: Array<HybridRetrievalResult["sources"][number] & { kbOrigin: "remote" }>
  /** Arms that failed on the remote engine, when any did. */
  degrades?: string[]
  /** Which scale `vectorScore` is on, so the caller picks the matching grounding threshold. */
  scoreScale: "rerank" | "similarity"
}

/** The fields of ChunkDto this mapping reads (rantai-kb 0.6.0). */
interface KbChunkDto {
  id: string
  content: string
  documentId: string
  documentTitle: string
  categories?: string[] | null
  section?: string | null
  page?: number | null
  chunkType?: string | null
  assetKey?: string | null
  contextualPrefix?: string | null
  similarity?: number | null
  retrieval?: { arms?: string[] | null; fusedScore?: number | null; rerankScore?: number | null } | null
}

/** The fields of SourceDto this mapping reads. */
interface KbSourceDto {
  documentId?: string | null
  documentTitle: string
  section?: string | null
  page?: number | null
  chunkType?: string | null
  assetKey?: string | null
}

/** The fields of SearchResponseDto this mapping reads. */
interface KbSearchResponseDto {
  context?: string | null
  chunks?: KbChunkDto[] | null
  sources?: KbSourceDto[] | null
  degrades?: string[] | null
  stats?: Partial<HybridSearchStats> | null
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v)

/**
 * The score grounding is judged on. 2026-11-19: `similarity` from this KB's embedder sits on a low,
 * overlapping scale (a correct rank-1 chunk at 0.20, an off-topic one at 0.34), so no threshold
 * separates in-book from off-book questions on it. The cross-encoder's `rerankScore` does (in-book
 * 0.89–0.998, off-book 0.00005–0.23 on the Kelas 7 benchmark). When the engine reranked any chunk the
 * whole response is judged on that scale, a chunk the reranker did not score counting as 0; with no
 * reranker at all it falls back to similarity and the route's similarity threshold.
 */
function scaleOf(response: KbSearchResponseDto): "rerank" | "similarity" {
  return (response.chunks ?? []).some((c) => finite(c.retrieval?.rerankScore)) ? "rerank" : "similarity"
}

function scoreOf(chunk: KbChunkDto, scale: "rerank" | "similarity"): number {
  if (scale === "rerank") {
    const rerank = chunk.retrieval?.rerankScore
    return finite(rerank) ? rerank : 0
  }
  return finite(chunk.similarity) ? chunk.similarity : 0
}

function toHybridResult(response: KbSearchResponseDto): RemoteHybridResult {
  const scale = scaleOf(response)
  const results: HybridSearchResult[] = (response.chunks ?? []).map((chunk, i) => {
    const arms = chunk.retrieval?.arms ?? []
    return {
      chunkId: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      // Not exposed by the remote API; see the module comment.
      chunkIndex: 0,
      documentTitle: chunk.documentTitle,
      section: chunk.section ?? undefined,
      category: chunk.categories?.[0],
      assetKey: chunk.assetKey ?? null,
      // Both engines are 0-based; passed through unchanged.
      page: chunk.page ?? null,
      chunkType: chunk.chunkType ?? null,
      anchorChunkIndex: null, // not exposed by the remote API
      figureSelected: arms.includes("figure"),
      vectorScore: scoreOf(chunk, scale),
      entityScore: 0,
      graphScore: 0,
      combinedScore: chunk.retrieval?.fusedScore ?? scoreOf(chunk, scale),
      rank: i + 1,
      contextualPrefix: chunk.contextualPrefix ?? null,
      relatedEntities: [],
      isNeighbor: arms.includes("neighbour"),
    }
  })

  const sources = (response.sources ?? []).map((s) => ({
    documentId: s.documentId ?? null,
    documentTitle: s.documentTitle,
    section: s.section ?? null,
    assetKey: s.assetKey ?? null,
    page: s.page ?? null,
    pages: s.page != null ? [s.page] : [],
    chunkType: s.chunkType ?? null,
    chunkIndex: null, // not exposed by the remote API
    anchorChunkIndex: null, // not exposed by the remote API
    kbOrigin: "remote" as const,
  }))

  const st = response.stats ?? {}
  const stats: HybridSearchStats = {
    totalTimeMs: st.totalTimeMs ?? 0,
    embeddingTimeMs: st.embeddingTimeMs ?? 0,
    vectorSearchTimeMs: st.vectorSearchTimeMs ?? 0,
    entitySearchTimeMs: st.entitySearchTimeMs ?? 0,
    graphSearchTimeMs: st.graphSearchTimeMs ?? 0,
    fusionTimeMs: st.fusionTimeMs ?? 0,
    vectorResults: st.vectorResults ?? 0,
    entityResults: st.entityResults ?? 0,
    graphResults: st.graphResults ?? 0,
    totalResults: st.totalResults ?? 0,
  }

  return {
    // The server assembles the context with the same [N] labels its sources
    // list is ordered by, so citations stay consistent by passing both
    // through untouched.
    context: response.context ?? "",
    sources,
    results,
    stats,
    scoreScale: scale,
    ...(response.degrades && response.degrades.length > 0 ? { degrades: response.degrades } : {}),
  }
}

/** Request helper in kb-client/index.ts's style: bearer key, hard timeout. */
async function remoteRequest<T>(
  path: string,
  init: RequestInit & { timeoutMs: number },
): Promise<T> {
  const cfg = remoteKbConfig()
  if (!cfg) throw new Error("KB remote routing is not configured (KB_REMOTE_URL / KB_REMOTE_API_KEY)")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs)
  try {
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${cfg.apiKey}`)
    if (init.body) headers.set("content-type", "application/json")

    const res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`KB remote ${res.status} on ${path}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Hybrid retrieval from rantai-kb, in the shape `smartHybridRetrieve`
 * returns. `hybrid` is not sent: rantai-kb's search is hybrid by
 * construction (its arms are dense/sparse/figure/…), so there is no flag to
 * raise.
 */
export async function remoteHybridRetrieve(
  query: string,
  options: RemoteHybridOptions,
): Promise<RemoteHybridResult> {
  const cfg = remoteKbConfig()
  if (!cfg) throw new Error("KB remote routing is not configured (KB_REMOTE_URL / KB_REMOTE_API_KEY)")

  const body: Record<string, unknown> = {
    query,
    knowledgeBaseIds: options.remoteKbIds,
  }
  if (options.maxChunks !== undefined) body.maxChunks = options.maxChunks

  const response = await remoteRequest<KbSearchResponseDto>("/v1/search", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: cfg.timeoutMs,
  })
  return toHybridResult(response ?? {})
}

/**
 * One figure crop's bytes from rantai-kb: `GET /v1/documents/{id}/assets?
 * key=<assetKey>`. The server enforces that the key lives under the
 * document's own asset prefix; the caller still pre-checks the key belongs to
 * the document (see inline-figures.ts) so a tampered source is refused
 * without a round trip.
 */
export async function remoteAssetDownload(documentId: string, assetKey: string): Promise<Buffer> {
  const cfg = remoteKbConfig()
  if (!cfg) throw new Error("KB remote routing is not configured (KB_REMOTE_URL / KB_REMOTE_API_KEY)")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const headers = new Headers()
    headers.set("authorization", `Bearer ${cfg.apiKey}`)

    const path = `/v1/documents/${encodeURIComponent(documentId)}/assets?key=${encodeURIComponent(assetKey)}`
    const res = await fetch(`${cfg.baseUrl}${path}`, { headers, signal: controller.signal })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`KB remote ${res.status} on ${path}: ${text.slice(0, 200)}`)
    }
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}
