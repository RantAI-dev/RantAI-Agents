import { getSurrealClient } from "@/lib/surrealdb"
import { getRagConfig } from "./config"

export interface DriftReport {
  /** Currently-configured embedding model (env or default). */
  currentModel: string
  /** Number of chunks tagged with each historical embedding model. null key = pre-tracking rows. */
  byModel: Array<{ model: string | null; chunkCount: number }>
  /** Number of chunks NOT matching currentModel (sum of all non-current rows). */
  staleChunkCount: number
  /** True when ALL chunks match currentModel. */
  inSync: boolean
}

/**
 * Detect chunks embedded with a different model than KB_EMBEDDING_MODEL.
 * Cheap aggregation query against SurrealDB; safe to call from an admin
 * endpoint or a periodic cron.
 *
 * Use the report to drive a bulk re-embed run when staleChunkCount > 0.
 */
export async function checkEmbeddingDrift(): Promise<DriftReport> {
  const cfg = getRagConfig()
  const client = await getSurrealClient()

  const result = await client.query<{ model: string | null; chunkCount: number }>(
    `SELECT embedding_model AS model, count() AS chunkCount FROM document_chunk GROUP BY model`
  )
  const rows = (result[0]?.result as Array<{ model: string | null; chunkCount: number }>) || []

  const byModel = rows.map((r) => ({ model: r.model ?? null, chunkCount: Number(r.chunkCount) || 0 }))
  const staleChunkCount = byModel
    .filter((r) => r.model !== cfg.embeddingModel)
    .reduce((sum, r) => sum + r.chunkCount, 0)
  const inSync = staleChunkCount === 0

  return {
    currentModel: cfg.embeddingModel,
    byModel,
    staleChunkCount,
    inSync,
  }
}
