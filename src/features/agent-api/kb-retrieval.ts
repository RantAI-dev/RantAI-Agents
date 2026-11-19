/**
 * The one retrieval entry both v1 call sites (chat and Latihan) go through.
 *
 * It decides per request which engine serves it — rantai-kb for knowledge
 * bases the route table has switched (lib/kb-client/routing), the in-process
 * engine for everything else — and holds the failure policy for the
 * migration: if the remote errors or times out, the old engine answers
 * instead, so a KB outage can never return an empty answer.
 *
 * It also returns the grounding threshold to apply to that retrieval: the
 * route table's `groundedMinScore` when the request was routed (a switched KB
 * can calibrate against the remote engine's scores), else the deployment
 * default from grounding.ts, which is what both call sites used before.
 */
import { resolveRemoteRoute } from "@/lib/kb-client/routing"
import { remoteHybridRetrieve } from "@/lib/kb-client/remote-hybrid"
import type { HybridRetrievalResult } from "@/lib/rag/retriever"
import { groundingThreshold } from "./grounding"

export interface RetrieveForGroupsOptions {
  /** The assistant's authorised knowledge-base group ids. Undefined means
   *  "no KB groups selected" and always runs the old engine, as today. */
  groupIds?: string[]
  organizationId?: string
  maxResults?: number
}

/**
 * A hybrid result whose sources may be marked kbOrigin: "remote" (the remote
 * mapping always sets it; local results leave it unset) so the inline-figure
 * loader can tell where each figure's bytes live.
 */
export type RoutedHybridResult = Omit<HybridRetrievalResult, "sources"> & {
  sources: Array<HybridRetrievalResult["sources"][number] & { kbOrigin?: "remote" }>
}

export interface RoutedRetrieval {
  result: RoutedHybridResult
  /** Threshold groundingOf should be applied with for this retrieval. */
  groundedMinScore: number
}

/** Grounding threshold on the reranker's scale when the route table sets none. On the Kelas 7
 *  benchmark in-book questions scored 0.89–0.998 and off-book ones at most 0.23. */
export const DEFAULT_GROUNDED_MIN_RERANK = 0.5

/** One line per request: engine used, KB ids searched, ms, chunk count, and
 *  the remote arms that failed, when any did. */
function logRequest(
  engine: "local" | "remote" | "local-after-fallback",
  kbIds: string[],
  ms: number,
  chunks: number,
  degrades?: string[],
): void {
  const parts = [
    `engine=${engine}`,
    `kb=${kbIds.length > 0 ? kbIds.join(",") : "-"}`,
    `ms=${ms}`,
    `chunks=${chunks}`,
  ]
  if (degrades && degrades.length > 0) parts.push(`degrades=${degrades.join("+")}`)
  console.log(`[kb-route] ${parts.join(" ")}`)
}

/**
 * Hybrid retrieval for a set of knowledge-base groups.
 *
 * Remote path: every groupId routed and enabled in the route table. Any
 * other mix — no groups, an unrouted group, a disabled route, no remote
 * config — runs the in-process engine exactly as both call sites called it
 * before, so an unswitched KB keeps today's behaviour bit for bit.
 */
export async function retrieveForGroups(
  query: string,
  options: RetrieveForGroupsOptions = {},
): Promise<RoutedRetrieval> {
  const route = resolveRemoteRoute(options.groupIds)

  /** The old engine, called exactly as today (lazy import so this module
   *  stays cheap and tests can substitute the engine). */
  const oldEngine = (): Promise<HybridRetrievalResult> =>
    import("@/lib/rag").then(({ smartHybridRetrieve }) =>
      smartHybridRetrieve(query, {
        groupIds: options.groupIds,
        organizationId: options.organizationId,
        ...(options.maxResults !== undefined ? { maxResults: options.maxResults } : {}),
      }),
    )

  if (!route) {
    const started = Date.now()
    const result = (await oldEngine()) as RoutedHybridResult
    logRequest("local", options.groupIds ?? [], Date.now() - started, result.results.length)
    return { result, groundedMinScore: groundingThreshold() }
  }

  const started = Date.now()
  try {
    const remote = await remoteHybridRetrieve(query, {
      remoteKbIds: route.remoteKbIds,
      ...(options.maxResults !== undefined ? { maxChunks: options.maxResults } : {}),
    })
    logRequest("remote", route.remoteKbIds, Date.now() - started, remote.results.length, remote.degrades)
    return {
      result: remote,
      groundedMinScore:
        remote.scoreScale === "rerank"
          ? (route.groundedMinRerank ?? DEFAULT_GROUNDED_MIN_RERANK)
          : (route.groundedMinScore ?? groundingThreshold()),
    }
  } catch (err) {
    // Never answer empty because the remote failed: the old engine still
    // holds every KB (switched ones too, until their local index is dropped),
    // so it answers instead. The reason is logged for the operator.
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`[kb-route] fallback: ${reason.slice(0, 200)}`)

    const result = (await oldEngine()) as RoutedHybridResult
    logRequest("local-after-fallback", options.groupIds ?? [], Date.now() - started, result.results.length)
    return { result, groundedMinScore: groundingThreshold() }
  }
}
