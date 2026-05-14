/**
 * Shared types for the RAG eval harness.
 *
 * The golden set is curated by hand (or LLM-assisted, then validated). The
 * runner calls the retrieval pipeline for each query, captures chunks + RAG
 * stats, and the metrics module scores the result against the golden entry.
 */

/** Kind of query — picks the appropriate metric expectations. */
export type QueryKind =
  | "lookup" // single-fact question against a specific document
  | "enumerate" // "list all PSAK" — directory-style
  | "compare" // multi-doc comparison
  | "followup" // multi-turn refinement
  | "oos" // out-of-scope — model should refuse

export interface GoldenEntry {
  /** Stable id for diffing across runs. */
  id: string
  /** Free-text query to send to retrieval. */
  query: string
  kind: QueryKind
  /** Document titles or partial title substrings expected to appear in retrieved chunks. */
  expectedDocs: string[]
  /** Optional substrings the answer text should contain. Used only when running full chat. */
  expectedAnswerSubstrings?: string[]
  /** True when the answer should refuse / say "not in knowledge base". */
  expectedRefusal?: boolean
  /** Prior user messages for follow-up scenarios; the runner replays them as a thread. */
  priorTurns?: Array<{ role: "user" | "assistant"; content: string }>
  /** KB groups the retrieval should run inside. If omitted, runs against all groups the test user owns. */
  knowledgeBaseGroupIds?: string[]
  /** Optional notes for human reviewers. */
  notes?: string
}

export interface GoldenSet {
  /** ISO timestamp of when this set was last updated. */
  updatedAt: string
  /** Name + version helps when diffing across changes to the set itself. */
  name: string
  version: string
  /** Default groups for entries that don't override. */
  defaultGroupIds?: string[]
  entries: GoldenEntry[]
}

/** Captured per query during a run. */
export interface QueryResult {
  id: string
  query: string
  kind: QueryKind
  /** Document titles surfaced via retrieved chunks (deduped, in retrieval rank order). */
  retrievedDocs: string[]
  /** Raw chunk count returned. */
  chunkCount: number
  /** Cosine similarity stats over the retrieved chunks. */
  scoreMin: number | null
  scoreMax: number | null
  scoreMean: number | null
  /** Total wallclock for the retrieval phase only (not full chat). */
  retrieveMs: number
  /** Generated answer text — only populated when --with-llm-judge passed. */
  answerText?: string
  /** ms wallclock for the answer-generation phase, when run. */
  generateMs?: number
  /**
   * LLM-as-judge faithfulness score (0..1) — only populated when --with-llm-judge passed.
   * 1.0 = every claim in the answer is supported by the retrieved chunks.
   */
  faithfulness?: number
  /** Optional one-line reasoning from the judge — debugging aid. */
  faithfulnessReason?: string
  /** True when retrieval threw (network down, SurrealDB unavailable). */
  errored: boolean
  errorMessage?: string
}

export interface RunReport {
  runId: string
  startedAt: string
  finishedAt: string
  goldenSet: { name: string; version: string }
  results: QueryResult[]
  /** Aggregated metrics across all entries. */
  summary: {
    queryCount: number
    erroredCount: number
    contextRecall: number
    expectedDocsHitCount: number
    expectedDocsTotal: number
    latencyP50Ms: number
    latencyP95Ms: number
    /** Average faithfulness across queries that produced an answer (--with-llm-judge runs only). */
    faithfulnessAvg?: number
    /** Count of queries scored — denominator for faithfulnessAvg. */
    faithfulnessCount?: number
  }
}
