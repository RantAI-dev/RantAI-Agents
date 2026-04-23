export interface RagConfig {
  extractPrimary: string;
  extractFallback: string;
  embeddingModel: string;
  embeddingDim: number;
  rerankEnabled: boolean;
  rerankModel: string;
  rerankInitialK: number;
  rerankFinalK: number;
  // Phase 7
  hybridBm25Enabled: boolean;
  contextualRetrievalEnabled: boolean;
  contextualRetrievalModel: string;
  queryExpansionEnabled: boolean;
  queryExpansionModel: string;
  queryExpansionParaphrases: number;
  /** Base URL for vision-LLM extraction. Default: OpenRouter /chat/completions. Override for on-prem vLLM. */
  extractVisionBaseUrl: string;
  /** Explicit API key for the extraction endpoint. Falls back to OPENROUTER_API_KEY when empty. */
  extractVisionApiKey: string;
  /**
   * Base URL of a MinerU2.5-Pro sidecar (see services/mineru-server/).
   * When set AND extractPrimary === "mineru", the ingest path sends PDFs
   * here instead of an OpenRouter vision LLM. Example: "http://localhost:8100".
   */
  extractMineruBaseUrl: string;
  /**
   * Model id the SmartRouterExtractor falls through to when the text layer
   * is insufficient. Recognizes the same sentinels as extractPrimary:
   * "mineru", "unpdf", "hybrid", or any OpenRouter model id. Default:
   * "openai/gpt-4.1-nano" (cloud). Set to "mineru" for on-prem.
   */
  extractSmartFallback: string;
  /** Base URL for embedding endpoint. Default: OpenRouter /embeddings. Override for on-prem TEI. */
  embeddingBaseUrl: string;
  /** Explicit API key for the embedding endpoint. Falls back to OPENROUTER_API_KEY when empty. */
  embeddingApiKey: string;
}

const DEFAULTS: RagConfig = {
  // Default = smart router (SmartRouterExtractor). Runs unpdf first (50 ms,
  // free), falls through to extractSmartFallback only on scan/table/garbled
  // signals. Benched at 98% coverage / 1.1 s avg on a 40-doc mixed corpus,
  // beats always-OCR on both quality and latency. See:
  //   docs/superpowers/specs/2026-04-22-smart-router-extractor-design.md
  //
  // The smart fallback default below (extractSmartFallback = "openai/gpt-4.1-nano")
  // means a fresh deployment with just OPENROUTER_API_KEY set works out of the
  // box. On-prem deployments should set KB_EXTRACT_SMART_FALLBACK="mineru" +
  // KB_EXTRACT_MINERU_BASE_URL.
  extractPrimary: "smart",
  // Fallback extractor used by the always-OCR path (KB_EXTRACT_PRIMARY set to
  // a model id, not "smart"). Unpdf-only so ingest still progresses when the
  // primary throws.
  extractFallback: "unpdf",
  embeddingModel: "qwen/qwen3-embedding-8b",
  embeddingDim: 4096,
  rerankEnabled: false,
  rerankModel: "openai/gpt-4.1-nano",
  rerankInitialK: 20,
  rerankFinalK: 5,
  // Phase 7
  hybridBm25Enabled: true,              // BM25 is essentially free — on by default
  contextualRetrievalEnabled: false,    // opt-in: adds ~50% to per-doc ingest latency
  contextualRetrievalModel: "openai/gpt-4.1-nano",
  queryExpansionEnabled: false,         // opt-in: adds ~400ms to each query
  queryExpansionModel: "openai/gpt-4.1-nano",
  queryExpansionParaphrases: 3,
  extractVisionBaseUrl: "https://openrouter.ai/api/v1/chat/completions",
  extractVisionApiKey: "",
  extractMineruBaseUrl: "",
  extractSmartFallback: "openai/gpt-4.1-nano",
  embeddingBaseUrl: "https://openrouter.ai/api/v1/embeddings",
  embeddingApiKey: "",
};

/** Resolve an API key: use the per-endpoint override if set, else fall back to OPENROUTER_API_KEY. */
export function resolveApiKey(override: string): string {
  if (override) return override;
  return process.env.OPENROUTER_API_KEY || "";
}

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${key} must be an integer, got "${raw}"`);
  }
  return n;
}

export function getRagConfig(): RagConfig {
  return {
    extractPrimary: process.env.KB_EXTRACT_PRIMARY || DEFAULTS.extractPrimary,
    extractFallback: process.env.KB_EXTRACT_FALLBACK || DEFAULTS.extractFallback,
    embeddingModel: process.env.KB_EMBEDDING_MODEL || DEFAULTS.embeddingModel,
    embeddingDim: parseIntEnv("KB_EMBEDDING_DIM", DEFAULTS.embeddingDim),
    rerankEnabled: process.env.KB_RERANK_ENABLED === "true",
    rerankModel: process.env.KB_RERANK_MODEL || DEFAULTS.rerankModel,
    rerankInitialK: parseIntEnv("KB_RERANK_INITIAL_K", DEFAULTS.rerankInitialK),
    rerankFinalK: parseIntEnv("KB_RERANK_FINAL_K", DEFAULTS.rerankFinalK),
    hybridBm25Enabled: process.env.KB_HYBRID_BM25_ENABLED !== "false",
    contextualRetrievalEnabled: process.env.KB_CONTEXTUAL_RETRIEVAL_ENABLED === "true",
    contextualRetrievalModel: process.env.KB_CONTEXTUAL_RETRIEVAL_MODEL || DEFAULTS.contextualRetrievalModel,
    queryExpansionEnabled: process.env.KB_QUERY_EXPANSION_ENABLED === "true",
    queryExpansionModel: process.env.KB_QUERY_EXPANSION_MODEL || DEFAULTS.queryExpansionModel,
    queryExpansionParaphrases: parseIntEnv("KB_QUERY_EXPANSION_PARAPHRASES", DEFAULTS.queryExpansionParaphrases),
    extractVisionBaseUrl: process.env.KB_EXTRACT_VISION_BASE_URL || DEFAULTS.extractVisionBaseUrl,
    extractVisionApiKey: process.env.KB_EXTRACT_VISION_API_KEY || DEFAULTS.extractVisionApiKey,
    extractMineruBaseUrl: process.env.KB_EXTRACT_MINERU_BASE_URL || DEFAULTS.extractMineruBaseUrl,
    extractSmartFallback: process.env.KB_EXTRACT_SMART_FALLBACK || DEFAULTS.extractSmartFallback,
    embeddingBaseUrl: process.env.KB_EMBEDDING_BASE_URL || DEFAULTS.embeddingBaseUrl,
    embeddingApiKey: process.env.KB_EMBEDDING_API_KEY || DEFAULTS.embeddingApiKey,
  };
}
