/**
 * Available LLM models for chat assistants
 * Models are sourced from OpenRouter
 * Updated: September 2026 (prices + context windows from the OpenRouter catalog)
 */

import { isHouseModel, getHouseModel } from "@/lib/llm/house-models"

export interface LLMModel {
  id: string
  name: string
  provider: string
  description: string
  contextWindow: number
  pricing: {
    input: number  // per million tokens
    output: number // per million tokens
  }
  capabilities: {
    vision: boolean
    functionCalling: boolean
    streaming: boolean
  }
  /** Cloud-only: locked for the current plan (paid model on free plan). */
  locked?: boolean
  /** Cloud-only: grouping bucket ("recommended" for the free router, else provider). */
  category?: string
  /** Cloud-only: true if this is the plan's default model. */
  isDefault?: boolean
}

/**
 * Available chat models from OpenRouter
 * Ordered by recommendation (default first)
 */
export const AVAILABLE_MODELS: LLMModel[] = [
  // Default Free Model
  {
    id: "openrouter/free",
    name: "Free Models Router",
    provider: "OpenRouter",
    description: "Routes to an available free model",
    contextWindow: 200000,
    pricing: { input: 0, output: 0 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // OpenAI Models
  {
    id: "openai/gpt-6-sol",
    name: "GPT-6 Sol",
    provider: "OpenAI",
    description: "Flagship GPT-6 model for complex work",
    contextWindow: 1050000,
    pricing: { input: 2, output: 10 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    provider: "OpenAI",
    description: "Fast, low-cost GPT-6 for everyday tasks",
    contextWindow: 1050000,
    pricing: { input: 0.1, output: 0.5 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "OpenAI",
    description: "Fast and affordable, great for most tasks",
    contextWindow: 400000,
    pricing: { input: 0.25, output: 2 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Anthropic Models
  {
    id: "anthropic/claude-opus-5.5",
    name: "Claude Opus 5.5",
    provider: "Anthropic",
    description: "Most capable Claude model",
    contextWindow: 1000000,
    pricing: { input: 4, output: 20 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "Anthropic",
    description: "Balanced Claude for coding and agents",
    contextWindow: 1000000,
    pricing: { input: 2, output: 10 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    description: "Previous-generation Sonnet",
    contextWindow: 1000000,
    pricing: { input: 3, output: 15 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Fast and affordable Claude model",
    contextWindow: 200000,
    pricing: { input: 1, output: 5 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Google Models
  {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "Google",
    description: "Latest Gemini, fast multimodal",
    contextWindow: 1048576,
    pricing: { input: 0.75, output: 3.75 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "google/gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    provider: "Google",
    description: "Cheapest current Gemini",
    contextWindow: 1048576,
    pricing: { input: 0.3, output: 2.5 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // DeepSeek Models
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    provider: "DeepSeek",
    description: "Very low-cost open model with vision",
    contextWindow: 1048576,
    pricing: { input: 0.04, output: 0.64 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    description: "Stronger DeepSeek for hard tasks",
    contextWindow: 1048576,
    pricing: { input: 0.9553, output: 1.9105 },
    capabilities: { vision: false, functionCalling: true, streaming: true },
  },

  // xAI Models
  {
    id: "x-ai/grok-4.7",
    name: "Grok 4.7",
    provider: "xAI",
    description: "Latest Grok model",
    contextWindow: 500000,
    pricing: { input: 1.6, output: 4.8 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Z.AI (formerly Zhipu) Models
  {
    id: "z-ai/glm-5.3",
    name: "GLM 5.3",
    provider: "Z.AI",
    description: "Latest GLM flagship",
    contextWindow: 1310720,
    pricing: { input: 0.84, output: 2.64 },
    capabilities: { vision: false, functionCalling: true, streaming: true },
  },
  {
    id: "z-ai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    provider: "Z.AI",
    description: "Fast, low-cost GLM with vision",
    contextWindow: 1310720,
    pricing: { input: 0.15, output: 0.5 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Moonshot Models
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    provider: "Moonshot",
    description: "Latest Kimi model",
    contextWindow: 1048576,
    pricing: { input: 3, output: 15 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Qwen Models
  {
    id: "qwen/qwen3.8-flash",
    name: "Qwen3.8 Flash",
    provider: "Qwen",
    description: "Fast multilingual Qwen with vision",
    contextWindow: 1000000,
    pricing: { input: 0.15, output: 0.47 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "qwen/qwen3.8-max-0902",
    name: "Qwen3.8 Max",
    provider: "Qwen",
    description: "Most capable Qwen",
    contextWindow: 1000000,
    pricing: { input: 2, output: 6 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // MiniMax Models
  {
    id: "minimax/minimax-m3",
    name: "MiniMax M3",
    provider: "MiniMax",
    description: "Long-context agentic model",
    contextWindow: 1048576,
    pricing: { input: 0.3, output: 1.2 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Xiaomi Models
  {
    id: "xiaomi/mimo-v2.6-flash",
    name: "MiMo V2.6 Flash",
    provider: "Xiaomi",
    description: "Fast and efficient for general chat",
    contextWindow: 1048576,
    pricing: { input: 0.14, output: 0.28 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Meta Models
  {
    id: "meta/muse-spark-1.3",
    name: "Muse Spark 1.3",
    provider: "Meta",
    description: "Latest Meta model",
    contextWindow: 1048576,
    pricing: { input: 1.25, output: 4.25 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "Meta",
    description: "Open-weight Llama model",
    contextWindow: 1048576,
    pricing: { input: 0.1875, output: 0.6525 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
]

/**
 * Default model ID used when no model is specified
 */
export const DEFAULT_MODEL_ID = "rantai/nano"

/**
 * Get model by ID
 */
/** Map a code-defined house model (rantai/*) to the LLMModel shape. */
function houseModelAsLLM(id: string): LLMModel | undefined {
  const m = getHouseModel(id)
  if (!m) return undefined
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    description: m.description,
    contextWindow: m.contextWindow,
    pricing: m.pricing,
    capabilities: m.capabilities,
  }
}

export function getModelById(id: string): LLMModel | undefined {
  return houseModelAsLLM(id) ?? AVAILABLE_MODELS.find((m) => m.id === id)
}

/**
 * Get model name for display
 */
export function getModelName(id: string): string {
  const model = getModelById(id)
  return model ? model.name : id.split("/").pop() || id
}

/**
 * Validate if a model ID is valid (static list only — use isValidModelAsync for DB check)
 */
export function isValidModel(id: string): boolean {
  return isHouseModel(id) || AVAILABLE_MODELS.some((m) => m.id === id)
}

// --- Async DB-backed versions (for server-side use) ---

import { prisma } from "@/lib/prisma"

/** Get all active models from DB, falling back to static list if DB is empty. */
export async function getModelsFromDb(): Promise<LLMModel[]> {
  const dbModels = await prisma.llmModel.findMany({
    where: { isActive: true },
    orderBy: [{ provider: "asc" }, { name: "asc" }],
  })

  if (dbModels.length === 0) return AVAILABLE_MODELS

  return dbModels.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    description: m.description,
    contextWindow: m.contextWindow,
    pricing: { input: m.pricingInput, output: m.pricingOutput },
    capabilities: {
      vision: m.hasVision,
      functionCalling: m.hasToolCalling,
      streaming: m.hasStreaming,
    },
  }))
}

/** Check if a model ID exists in DB or static list. */
export async function isValidModelAsync(id: string): Promise<boolean> {
  if (isHouseModel(id)) return true
  const dbModel = await prisma.llmModel.findUnique({
    where: { id },
    select: { id: true },
  })
  if (dbModel) return true
  return AVAILABLE_MODELS.some((m) => m.id === id)
}

/** Get a model by id from the DB (synced), falling back to the static list. */
export async function getModelByIdAsync(id: string): Promise<LLMModel | undefined> {
  const dbModels = await getModelsFromDb()
  return dbModels.find((m) => m.id === id) ?? getModelById(id)
}
