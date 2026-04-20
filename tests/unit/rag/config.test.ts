import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getRagConfig } from "@/lib/rag/config"

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
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns SOTA defaults when no env vars set", () => {
    const cfg = getRagConfig()
    expect(cfg.embeddingModel).toBe("qwen/qwen3-embedding-8b")
    expect(cfg.embeddingDim).toBe(4096)
    expect(cfg.rerankEnabled).toBe(false)
    expect(cfg.rerankInitialK).toBe(20)
    expect(cfg.rerankFinalK).toBe(5)
    expect(cfg.extractPrimary).toBeTruthy()
    expect(cfg.extractFallback).toBeTruthy()
    expect(cfg.rerankModel).toBeTruthy()
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
})
