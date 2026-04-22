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
  /** Base URL for embedding endpoint. Default: OpenRouter /embeddings. Override for on-prem TEI. */
  embeddingBaseUrl: string;
  /** Explicit API key for the embedding endpoint. Falls back to OPENROUTER_API_KEY when empty. */
  embeddingApiKey: string;
}

const DEFAULTS: RagConfig = {
  // Cloud default = gpt-4.1-nano (consistent accuracy, ~$0.00031/page, no catastrophic
  // failure modes seen in our benches). On-prem deployments override to "mineru" +
  // extractMineruBaseUrl to use the local MinerU2.5-Pro sidecar.
  extractPrimary: "openai/gpt-4.1-nano",
  // Fallback = unpdf (text-layer only) so ingest still progresses when the primary
  // extractor is unavailable / throws. No cloud fallback — keep the stack single-vendor.
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
    embeddingBaseUrl: process.env.KB_EMBEDDING_BASE_URL || DEFAULTS.embeddingBaseUrl,
    embeddingApiKey: process.env.KB_EMBEDDING_API_KEY || DEFAULTS.embeddingApiKey,
  };
}
