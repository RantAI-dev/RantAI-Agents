/**
 * The KB engine's complete configuration surface.
 *
 * Every environment variable the engine reads is declared here. This is what a
 * standalone KB service would accept, and what an operator must be able to set
 * — the list that has to be handed over when the engine moves to its own repo.
 *
 * `tests/unit/kb-config-surface.test.ts` scans the engine directories and
 * fails when a variable is read but not declared, so this cannot silently rot
 * the way an ordinary docs table would.
 *
 * Note on the deliberate design: reads are NOT funnelled through a single
 * accessor. Several are intentionally read at call time (the worker tunables,
 * feature flags the tests flip with `process.env` + `vi.resetModules()`), and
 * `RagConfig` additionally carries a DB-override layer with its own caching.
 * Centralising the *declaration* is what makes the surface portable;
 * centralising every *read* would change semantics for no extraction benefit.
 */

export interface KbEnvVar {
  name: string
  /** What it controls, in one line. */
  purpose: string
  /** Effective default when unset. */
  default: string
  /** Does a standalone deployment normally need to set this? */
  required?: boolean
}

export const KB_ENV_SURFACE: KbEnvVar[] = [
  // ── Embeddings ────────────────────────────────────────────────────────────
  { name: "KB_EMBEDDING_BASE_URL", purpose: "OpenAI-compatible embeddings endpoint", default: "https://openrouter.ai/api/v1/embeddings" },
  { name: "KB_EMBEDDING_API_KEY", purpose: "Key for the embeddings endpoint", default: "falls back to OPENROUTER_API_KEY", required: true },
  { name: "KB_EMBEDDING_MODEL", purpose: "Embedding model id", default: "qwen/qwen3-embedding-8b" },
  { name: "KB_EMBEDDING_DIM", purpose: "Embedding dimensions (must match the vector index)", default: "4096" },
  { name: "KB_EMBED_BATCH_SIZE", purpose: "Texts per embedding request", default: "128, clamped per provider" },
  { name: "KB_EMBED_CONCURRENCY", purpose: "Parallel embedding requests", default: "4" },
  { name: "KB_QUERY_EMBED_CACHE_SIZE", purpose: "Query-embedding LRU size", default: "500" },
  { name: "KB_QUERY_EMBED_CACHE_TTL_MS", purpose: "Query-embedding LRU TTL", default: "300000" },

  // ── Retrieval ─────────────────────────────────────────────────────────────
  { name: "KB_DEFAULT_MAX_CHUNKS", purpose: "Chunks returned per retrieval", default: "8" },
  { name: "KB_NEIGHBOR_WINDOW", purpose: "Adjacent chunks pulled around a hit", default: "1" },
  { name: "KB_VECTOR_KNN", purpose: "Use the HNSW KNN operator instead of a full cosine scan", default: "false" },
  { name: "KB_HYBRID_BM25_ENABLED", purpose: "Run BM25 alongside vector search", default: "true" },
  { name: "KB_ENTITY_SEARCH_ENABLED", purpose: "Include the entity/graph arm in retrieval", default: "true" },
  { name: "KB_STANDALONE_QUERY_ENABLED", purpose: "Rewrite follow-ups into standalone queries", default: "false" },
  { name: "KB_INTENT_CLASSIFIER_ENABLED", purpose: "Classify intent before retrieval", default: "false" },
  { name: "KB_QUERY_EXPANSION_ENABLED", purpose: "Expand the query into paraphrases", default: "false" },
  { name: "KB_QUERY_EXPANSION_MODEL", purpose: "Model used for paraphrases", default: "provider default" },
  { name: "KB_QUERY_EXPANSION_PARAPHRASES", purpose: "Number of paraphrases", default: "3" },
  { name: "KB_CONTEXTUAL_RETRIEVAL_ENABLED", purpose: "Prefix chunks with generated context at ingest", default: "false" },
  { name: "KB_CONTEXTUAL_RETRIEVAL_MODEL", purpose: "Model for contextual prefixes", default: "provider default" },
  { name: "KB_CITATION_GROUNDING_ENABLED", purpose: "Check answers against cited chunks", default: "false" },

  // ── Reranking ─────────────────────────────────────────────────────────────
  { name: "KB_RERANK_ENABLED", purpose: "Rerank retrieved chunks", default: "false" },
  { name: "KB_RERANK_PROVIDER", purpose: "cohere | vllm | llm", default: "llm" },
  { name: "KB_RERANK_MODEL", purpose: "Reranker model id", default: "provider default" },
  { name: "KB_RERANK_BASE_URL", purpose: "Reranker endpoint (vllm/TEI)", default: "unset" },
  { name: "KB_RERANK_API_KEY", purpose: "Reranker key", default: "unset" },
  { name: "KB_RERANK_INITIAL_K", purpose: "Candidates fetched before reranking", default: "30" },
  { name: "KB_RERANK_FINAL_K", purpose: "Chunks kept after reranking", default: "8" },
  { name: "COHERE_API_KEY", purpose: "Key when KB_RERANK_PROVIDER=cohere", default: "unset" },

  // ── Extraction / OCR ──────────────────────────────────────────────────────
  { name: "KB_EXTRACT_PRIMARY", purpose: "Primary extraction strategy", default: "smart" },
  { name: "KB_EXTRACT_FALLBACK", purpose: "Fallback extraction strategy", default: "unpdf" },
  { name: "KB_EXTRACT_SMART_FALLBACK", purpose: "What 'smart' falls back to", default: "mineru" },
  { name: "KB_EXTRACT_MINERU_BASE_URL", purpose: "On-prem MinerU sidecar URL", default: "unset (sidecar disabled)" },
  { name: "KB_EXTRACT_MINERU_TIMEOUT_MS", purpose: "Sidecar timeout", default: "1200000 (20 min)" },
  { name: "KB_LAYOUT_EXTRACTOR_ORDER", purpose: "CSV chain: sidecar,mineru-api,mistral", default: "sidecar,mineru-api,mistral" },
  { name: "KB_MINERU_API_KEY", purpose: "Hosted MinerU API key", default: "unset (provider skipped)" },
  { name: "KB_MINERU_API_BASE", purpose: "Hosted MinerU base URL", default: "vendor default" },
  { name: "KB_MINERU_API_LANG", purpose: "OCR language hint", default: "auto" },
  { name: "KB_MINERU_API_TIMEOUT_MS", purpose: "Hosted MinerU timeout", default: "600000 (10 min)" },
  { name: "KB_MISTRAL_OCR_KEY", purpose: "Mistral OCR key", default: "unset (provider skipped)" },
  { name: "KB_MISTRAL_OCR_MODEL", purpose: "Mistral OCR model", default: "vendor default" },
  { name: "KB_MISTRAL_OCR_BASE", purpose: "Mistral OCR base URL", default: "vendor default" },
  { name: "KB_EXTRACT_VISION_BASE_URL", purpose: "Vision endpoint for figure understanding", default: "unset" },
  { name: "KB_EXTRACT_VISION_API_KEY", purpose: "Vision endpoint key", default: "unset" },

  // ── Figures / multimodal ──────────────────────────────────────────────────
  { name: "KB_VLM_AT_ANSWER_ENABLED", purpose: "Attach figure crops to the answer call", default: "false" },
  { name: "KB_VLM_AT_ANSWER_TYPES", purpose: "Figure kinds eligible for VLM", default: "chart,diagram" },
  { name: "KB_VLM_AT_ANSWER_MAX_IMAGES", purpose: "Max images per answer", default: "2" },
  { name: "KB_FIGURE_MIN_RERANK", purpose: "Rerank score a figure must clear", default: "0.3" },
  { name: "KB_FIGURE_MAX_PER_ANSWER", purpose: "Figures surfaced per answer", default: "3" },

  // ── Document intelligence ─────────────────────────────────────────────────
  { name: "KB_ENTITY_EXTRACTION_ENABLED", purpose: "Run entity/relation extraction at ingest", default: "true" },
  { name: "ENTITY_EXTRACTION_LLM_MODEL", purpose: "Entity extraction model", default: "provider default" },
  { name: "ENTITY_EXTRACTION_LLM_BASE_URL", purpose: "Explicit endpoint override", default: "unset (uses the provider registry)" },
  { name: "ENTITY_EXTRACTION_LLM_API_KEY", purpose: "Key for that endpoint", default: "falls back to the extractor default" },
  { name: "RELATION_EXTRACTION_LLM_MODEL", purpose: "Relation extraction model", default: "same as entity model" },

  // ── Ingest worker ─────────────────────────────────────────────────────────
  { name: "KB_INGEST_CONCURRENCY", purpose: "Jobs processed in parallel", default: "1" },
  { name: "KB_INGEST_POLL_MS", purpose: "Job claim poll interval", default: "3000" },
  { name: "KB_INGEST_STALE_MS", purpose: "When a processing job counts as stalled", default: "300000 (5 min)" },
  { name: "KB_INGEST_MAX_ATTEMPTS", purpose: "Attempts before terminal failure", default: "3" },
  { name: "KB_INGEST_RECLAIM_MS", purpose: "Stale-reclaim sweep interval", default: "60000" },
  { name: "KB_STORE_CHUNKS_CONCURRENCY", purpose: "Parallel chunk writes to the vector store", default: "4" },

  // ── Shared ────────────────────────────────────────────────────────────────
  { name: "OPENROUTER_API_KEY", purpose: "Fallback key for every OpenAI-compatible call", default: "unset", required: true },
]

/** Fast membership check used by the drift test. */
export const KB_ENV_NAMES: ReadonlySet<string> = new Set(KB_ENV_SURFACE.map((v) => v.name))
