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
}

const DEFAULTS: RagConfig = {
  extractPrimary: "openai/gpt-4.1-nano",
  extractFallback: "google/gemini-3-flash-preview",
  embeddingModel: "qwen/qwen3-embedding-8b",
  embeddingDim: 4096,
  rerankEnabled: false,
  rerankModel: "google/gemini-3-flash-preview",
  rerankInitialK: 20,
  rerankFinalK: 5,
  // Phase 7
  hybridBm25Enabled: true,              // BM25 is essentially free — on by default
  contextualRetrievalEnabled: false,    // opt-in: adds ~50% to per-doc ingest latency
  contextualRetrievalModel: "openai/gpt-4.1-nano",
  queryExpansionEnabled: false,         // opt-in: adds ~400ms to each query
  queryExpansionModel: "openai/gpt-4.1-nano",
  queryExpansionParaphrases: 3,
};

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
  };
}
