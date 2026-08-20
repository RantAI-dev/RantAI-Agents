import type { HybridRetrievalResult, RetrievalResult } from "@/lib/rag/retriever"
import { kbServiceConfig, remoteSearch, type RemoteSearchOptions } from "./index"

/**
 * One entry point for knowledge retrieval, whichever way the KB is deployed.
 *
 * With KB_SERVICE_URL set the query goes to a standalone KB service; otherwise
 * it runs the engine in-process exactly as before. Call sites should not care
 * — that is the point of routing here instead of at each of them.
 *
 * Failure policy: retrieval is on the answer path, so a KB that is down must
 * degrade to an answer without sources rather than an error page. Remote
 * failures are logged and return empty, matching what the local path does when
 * nothing matches.
 */

export interface KnowledgeQueryOptions extends RemoteSearchOptions {
  /** Local engine's name for knowledgeBaseIds. */
  groupIds?: string[]
  categoryFilter?: string
  minSimilarity?: number
}

const EMPTY: RetrievalResult = { context: "", sources: [], chunks: [] } as RetrievalResult

export function isRemoteKb(): boolean {
  return kbServiceConfig() !== null
}

/**
 * The hybrid path returns its hits under `results`; normalise to the common
 * shape so callers do not branch on how the KB happened to search.
 */
function normalizeHybrid(result: HybridRetrievalResult): RetrievalResult {
  return {
    context: result.context,
    sources: result.sources,
    // Hybrid hits carry extra scoring fields and lack a couple the vector
    // shape has; callers only read id/content/documentId/title, so widen
    // rather than pretend the two are identical.
    chunks: (result.results ?? []) as unknown as RetrievalResult["chunks"],
  } as RetrievalResult
}

export async function retrieveKnowledge(
  query: string,
  options: KnowledgeQueryOptions = {}
): Promise<RetrievalResult> {
  const cfg = kbServiceConfig()

  if (cfg) {
    try {
      return await remoteSearch(cfg, query, {
        maxChunks: options.maxChunks,
        knowledgeBaseIds: options.knowledgeBaseIds ?? options.groupIds,
        documentIds: options.documentIds,
        category: options.category ?? options.categoryFilter,
        hybrid: options.hybrid,
      })
    } catch (err) {
      console.error(
        `[kb-client] remote retrieval failed, answering without sources: ${
          err instanceof Error ? err.message : err
        }`
      )
      return EMPTY
    }
  }

  const { smartRetrieve, smartHybridRetrieve } = await import("@/lib/rag")
  const localOptions = {
    maxChunks: options.maxChunks,
    groupIds: options.groupIds ?? options.knowledgeBaseIds,
    categoryFilter: options.categoryFilter ?? options.category,
    minSimilarity: options.minSimilarity,
  }
  return options.hybrid
    ? normalizeHybrid(await smartHybridRetrieve(query, localOptions))
    : smartRetrieve(query, localOptions)
}
