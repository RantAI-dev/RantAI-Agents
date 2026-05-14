# Embedding model swap workflow

> **Goal**: replace `qwen/qwen3-embedding-8b` (4096-dim) with `BAAI/bge-m3` (1024-dim) to drop vector-search latency from ~16s p50 to ~1s p50.
>
> **Quality expectation**: lookup recall stays similar (eval baseline 2026-05-13 showed lookup already saturated at 30/30 with high scoreMax; embedding model is not the recall bottleneck). Followup + compare recall unchanged. The win is purely latency.
>
> **Risk**: requires re-embedding every chunk in production. The MTREE index must be dropped + recreated at the new dimension before re-embed. Mid-process the KB is partially-functional (chunks with mixed dimensions).
>
> **Estimated runtime**: ~30 minutes for 98 PSAK docs + ~$0.05-0.20 in BGE-M3 embedding calls (via OpenRouter or self-host).

## Prerequisites

1. Branch `feat/rag-improvements` merged or available
2. `KB_STANDALONE_QUERY_ENABLED=true` flipped on (proven necessary; do this first)
3. Recent eval baseline saved for compare (`eval-runs/*.json`)
4. Maintenance window OR canary org with the swap only

## Step 1 — Stop new ingest

In your deployment, set a maintenance flag or pause uploads. Otherwise new chunks come in with the old model while existing chunks are being re-embedded → inconsistent vector space.

If you have a single instance: just don't upload anything during the swap. Re-embed is fast on a 98-doc corpus.

## Step 2 — Swap env vars

```bash
# .env (or .env.production)
KB_EMBEDDING_MODEL="BAAI/bge-m3"
KB_EMBEDDING_DIM="1024"
```

Restart the server so the new model is picked up by `getRagConfig()`.

## Step 3 — Drop the old MTREE index + recreate at new dimension

The SurrealDB MTREE index is dimension-bound. The schema file declares 4096; we need 1024.

```bash
# Edit src/lib/surrealdb/schema.surql:
#   line 29: DIMENSION 4096 → DIMENSION 1024
#   line 90: DIMENSION 4096 → DIMENSION 1024  (conversation_memory index)
```

Then connect to SurrealDB and apply the schema. There's no IF NOT EXISTS on the index definition because the old + new have different dimensions — must explicitly drop + recreate:

```sql
-- run via surreal CLI or admin endpoint
REMOVE INDEX embedding_idx ON document_chunk;
DEFINE INDEX embedding_idx ON document_chunk FIELDS embedding MTREE DIMENSION 1024 DIST COSINE;

REMOVE INDEX conversation_embedding_idx ON conversation_memory;
DEFINE INDEX conversation_embedding_idx ON conversation_memory FIELDS embedding MTREE DIMENSION 1024 DIST COSINE;
```

Old vectors in chunks/conversation_memory rows still have length=4096 at this point. They are out-of-sync with the index. **Queries WILL ERROR or return junk** until Step 4 completes.

## Step 4 — Bulk re-embed every chunk

The branch ships `POST /api/dashboard/files/bulk/re-embed`. Hit it with `onlyStale: true` — that finds every chunk whose `embedding_model` doesn't match the current config (which after Step 2 = bge-m3) and re-embeds them with the new model.

```bash
curl -X POST http://localhost:3000/api/dashboard/files/bulk/re-embed \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"onlyStale": true, "concurrency": 4}'
```

Response (after ~30 min for 98 docs):
```json
{
  "attempted": 98,
  "succeeded": 98,
  "skipped": 0,
  "failed": 0,
  "totalChunks": ~XXXX,
  "totalMs": ~1800000,
  "embeddingModel": "BAAI/bge-m3",
  "results": [...]
}
```

If `failed > 0`, check the `results[]` array for the per-doc error message. Common failures:
- Rate-limit from embedding provider → re-run with lower `concurrency`
- Single-doc embedding mismatch (chunks/embeddings count off) → manual investigation

## Step 5 — Verify drift = 0

```bash
curl http://localhost:3000/api/dashboard/files/drift \
  -H "Cookie: <your-session-cookie>"
```

Expect `inSync: true`, `staleChunkCount: 0`. If non-zero, re-run Step 4 — there may be a few docs that failed and need a retry.

## Step 6 — Re-run eval

```bash
bun scripts/eval-rag/run.ts tests/fixtures/rag-golden.json
```

Compare summary vs the pre-swap baseline (`eval-runs/2026-05-13T09-21-48-878Z_zx1y.json`):

| Metric | Pre-swap (qwen-8b, 4096-dim) | Expected post-swap (bge-m3, 1024-dim) |
|---|---|---|
| contextRecall | 94.4% | ≥ 90% (similar; embedding model not the bottleneck) |
| latencyP50Ms | 18366 | **≤ 3000** (10× win — index actually used) |
| latencyP95Ms | 20564 | **≤ 5000** |
| scoreMax (lookup) | 0.65-0.88 | 0.60-0.85 (similar; multilingual-strong model) |

If recall drops below 85% across the board, rollback (Step 7). If latency doesn't drop, the index isn't being used — check KNN syntax compatibility on your SurrealDB version.

## Step 7 — Rollback (only if quality regresses)

1. Set env back: `KB_EMBEDDING_MODEL="qwen/qwen3-embedding-8b"`, `KB_EMBEDDING_DIM="4096"`
2. Re-edit `schema.surql` DIMENSION → 4096
3. `REMOVE INDEX` + re-`DEFINE INDEX` at 4096
4. `POST /api/dashboard/files/bulk/re-embed { "onlyStale": true }` to re-embed back to qwen
5. Restart

Effort: same as the forward swap. The infra is symmetric.

## Why this is deferred

The current 4096-dim full-scan is **structural** — fixable only by reducing dimensions. The eval data shows quality is fine; the user-perceived problem is latency (vector dominates p50 at ~16s of the ~18s pre-stream). Swapping unblocks SOTA-grade latency without quality cost.

User chose to defer until eval data was in. Now (post-2026-05-13 eval) data backs the swap. Recommended next maintenance window.
