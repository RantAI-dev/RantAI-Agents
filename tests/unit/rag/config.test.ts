import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getRagConfig, resolveApiKey } from "@/lib/rag/config"

describe("getRagConfig", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.KB_EXTRACT_PRIMARY
    delete process.env.KB_EXTRACT_FALLBACK
    delete process.env.KB_EMBEDDING_MODEL
    delete process.env.KB_EMBEDDING_DIM
    delete process.env.KB_RERANK_ENABLED
    delete process.env.KB_RERANK_MODEL
    delete process.env.KB_RERANK_INITIAL_K
    delete process.env.KB_RERANK_FINAL_K
    delete process.env.KB_EXTRACT_VISION_BASE_URL
    delete process.env.KB_EXTRACT_VISION_API_KEY
    delete process.env.KB_EMBEDDING_BASE_URL
    delete process.env.KB_EMBEDDING_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns SOTA defaults when no env vars set", () => {
    const cfg = getRagConfig()
    expect(cfg.extractPrimary).toBe("openai/gpt-4.1-nano")
    expect(cfg.extractFallback).toBe("unpdf")
    expect(cfg.embeddingModel).toBe("qwen/qwen3-embedding-8b")
    expect(cfg.embeddingDim).toBe(4096)
    expect(cfg.rerankEnabled).toBe(false)
    expect(cfg.rerankModel).toBe("openai/gpt-4.1-nano")
    expect(cfg.rerankInitialK).toBe(20)
    expect(cfg.rerankFinalK).toBe(5)
    expect(cfg.extractMineruBaseUrl).toBe("")
  })

  it("reads KB_EXTRACT_MINERU_BASE_URL into extractMineruBaseUrl", () => {
    process.env.KB_EXTRACT_MINERU_BASE_URL = "http://localhost:8100"
    const cfg = getRagConfig()
    expect(cfg.extractMineruBaseUrl).toBe("http://localhost:8100")
  })

  it("reads overrides from env", () => {
    process.env.KB_EXTRACT_PRIMARY = "anthropic/claude-haiku-4.5"
    process.env.KB_EMBEDDING_MODEL = "openai/text-embedding-3-large"
    process.env.KB_EMBEDDING_DIM = "3072"
    process.env.KB_RERANK_ENABLED = "true"
    process.env.KB_RERANK_INITIAL_K = "40"
    const cfg = getRagConfig()
    expect(cfg.extractPrimary).toBe("anthropic/claude-haiku-4.5")
    expect(cfg.embeddingModel).toBe("openai/text-embedding-3-large")
    expect(cfg.embeddingDim).toBe(3072)
    expect(cfg.rerankEnabled).toBe(true)
    expect(cfg.rerankInitialK).toBe(40)
  })

  it("throws if KB_EMBEDDING_DIM is non-numeric", () => {
    process.env.KB_EMBEDDING_DIM = "not-a-number"
    expect(() => getRagConfig()).toThrow(/KB_EMBEDDING_DIM/)
  })

  it("rerankEnabled is false unless explicitly 'true'", () => {
    process.env.KB_RERANK_ENABLED = "1"
    expect(getRagConfig().rerankEnabled).toBe(false)
    process.env.KB_RERANK_ENABLED = "yes"
    expect(getRagConfig().rerankEnabled).toBe(false)
    process.env.KB_RERANK_ENABLED = "true"
    expect(getRagConfig().rerankEnabled).toBe(true)
  })

  it("phase 7 defaults: BM25 on, CR off, query-expansion off", () => {
    delete process.env.KB_HYBRID_BM25_ENABLED
    delete process.env.KB_CONTEXTUAL_RETRIEVAL_ENABLED
    delete process.env.KB_QUERY_EXPANSION_ENABLED
    delete process.env.KB_QUERY_EXPANSION_MODEL
    delete process.env.KB_QUERY_EXPANSION_PARAPHRASES
    delete process.env.KB_CONTEXTUAL_RETRIEVAL_MODEL
    const cfg = getRagConfig()
    expect(cfg.hybridBm25Enabled).toBe(true)
    expect(cfg.contextualRetrievalEnabled).toBe(false)
    expect(cfg.queryExpansionEnabled).toBe(false)
    expect(cfg.queryExpansionModel).toBe("openai/gpt-4.1-nano")
    expect(cfg.queryExpansionParaphrases).toBe(3)
    expect(cfg.contextualRetrievalModel).toBe("openai/gpt-4.1-nano")
    // on-prem URL defaults
    expect(cfg.extractVisionBaseUrl).toBe("https://openrouter.ai/api/v1/chat/completions")
    expect(cfg.extractVisionApiKey).toBe("")
    expect(cfg.embeddingBaseUrl).toBe("https://openrouter.ai/api/v1/embeddings")
    expect(cfg.embeddingApiKey).toBe("")
  })

  it("phase 7 env overrides are honored", () => {
    process.env.KB_HYBRID_BM25_ENABLED = "false"
    process.env.KB_CONTEXTUAL_RETRIEVAL_ENABLED = "true"
    process.env.KB_QUERY_EXPANSION_ENABLED = "true"
    process.env.KB_QUERY_EXPANSION_PARAPHRASES = "5"
    process.env.KB_CONTEXTUAL_RETRIEVAL_MODEL = "anthropic/claude-haiku-4.5"
    const cfg = getRagConfig()
    expect(cfg.hybridBm25Enabled).toBe(false)
    expect(cfg.contextualRetrievalEnabled).toBe(true)
    expect(cfg.queryExpansionEnabled).toBe(true)
    expect(cfg.queryExpansionParaphrases).toBe(5)
    expect(cfg.contextualRetrievalModel).toBe("anthropic/claude-haiku-4.5")
  })

  it("on-prem base URL overrides are honored", () => {
    process.env.KB_EXTRACT_VISION_BASE_URL = "http://vllm:8000/v1/chat/completions"
    process.env.KB_EXTRACT_VISION_API_KEY = "vllm-token"
    process.env.KB_EMBEDDING_BASE_URL = "http://tei:8080/embed"
    process.env.KB_EMBEDDING_API_KEY = "tei-token"
    const cfg = getRagConfig()
    expect(cfg.extractVisionBaseUrl).toBe("http://vllm:8000/v1/chat/completions")
    expect(cfg.extractVisionApiKey).toBe("vllm-token")
    expect(cfg.embeddingBaseUrl).toBe("http://tei:8080/embed")
    expect(cfg.embeddingApiKey).toBe("tei-token")
  })

  it("resolveApiKey uses override when set, else falls back to OPENROUTER_API_KEY", () => {
    process.env.OPENROUTER_API_KEY = "global-key"
    expect(resolveApiKey("")).toBe("global-key")
    expect(resolveApiKey("override-key")).toBe("override-key")
  })

  it("defaults extractSmartFallback to openai/gpt-4.1-nano", () => {
    delete process.env.KB_EXTRACT_SMART_FALLBACK
    const cfg = getRagConfig()
    expect(cfg.extractSmartFallback).toBe("openai/gpt-4.1-nano")
  })

  it("reads KB_EXTRACT_SMART_FALLBACK override", () => {
    process.env.KB_EXTRACT_SMART_FALLBACK = "mineru"
    const cfg = getRagConfig()
    expect(cfg.extractSmartFallback).toBe("mineru")
  })
})
