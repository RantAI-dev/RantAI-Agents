/**
 * Available LLM models for chat assistants
 * Models are sourced from OpenRouter
 * Updated: February 2026
 */

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
}

/**
 * Available chat models from OpenRouter
 * Ordered by recommendation (default first)
 */
export const AVAILABLE_MODELS: LLMModel[] = [
  // Default Free Model
  {
    id: "xiaomi/mimo-v2-flash",
    name: "MiMo V2 Flash",
    provider: "Xiaomi",
    description: "Free, fast and efficient for general chat",
    contextWindow: 32768,
    pricing: { input: 0, output: 0 },
    capabilities: { vision: false, functionCalling: false, streaming: true },
  },

  // OpenAI Models
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    provider: "OpenAI",
    description: "Latest and most capable OpenAI model",
    contextWindow: 256000,
    pricing: { input: 5, output: 15 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "openai/gpt-5.2-mini",
    name: "GPT-5.2 Mini",
    provider: "OpenAI",
    description: "Fast and affordable, great for most tasks",
    contextWindow: 256000,
    pricing: { input: 0.5, output: 1.5 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "openai/o3-mini",
    name: "O3 Mini",
    provider: "OpenAI",
    description: "Advanced reasoning model",
    contextWindow: 200000,
    pricing: { input: 1.1, output: 4.4 },
    capabilities: { vision: false, functionCalling: true, streaming: true },
  },

  // Anthropic Models
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    description: "Latest Claude with superior reasoning",
    contextWindow: 200000,
    pricing: { input: 3, output: 15 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Fast and affordable Claude model",
    contextWindow: 200000,
    pricing: { input: 0.8, output: 4 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Google Models
  {
    id: "google/gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "Google",
    description: "Most advanced Gemini model",
    contextWindow: 2000000,
    pricing: { input: 1.25, output: 5 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "Google",
    description: "Fast multimodal model, great value",
    contextWindow: 1000000,
    pricing: { input: 0.1, output: 0.4 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // DeepSeek Models
  {
    id: "deepseek/deepseek-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    description: "Powerful open model, excellent value",
    contextWindow: 131072,
    pricing: { input: 0.14, output: 0.28 },
    capabilities: { vision: false, functionCalling: true, streaming: true },
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "Advanced reasoning model",
    contextWindow: 65536,
    pricing: { input: 0.55, output: 2.19 },
    capabilities: { vision: false, functionCalling: false, streaming: true },
  },

  // Zhipu Models
  {
    id: "zhipu/glm-4.7",
    name: "GLM 4.7",
    provider: "Zhipu AI",
    description: "Latest GLM model with strong capabilities",
    contextWindow: 128000,
    pricing: { input: 0.5, output: 1 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Moonshot Models
  {
    id: "moonshot/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "Moonshot",
    description: "Advanced Chinese AI model",
    contextWindow: 200000,
    pricing: { input: 0.6, output: 1.2 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Meta Models
  {
    id: "meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "Meta",
    description: "Latest open-source Llama model",
    contextWindow: 131072,
    pricing: { input: 0.2, output: 0.6 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
  },

  // Qwen Models
  {
    id: "qwen/qwen-3-72b",
    name: "Qwen 3 72B",
    provider: "Alibaba",
    description: "Strong multilingual support",
    contextWindow: 131072,
    pricing: { input: 0.15, output: 0.15 },
    capabilities: { vision: false, functionCalling: true, streaming: true },
  },
]

/**
 * Default model ID used when no model is specified
 */
export const DEFAULT_MODEL_ID = "xiaomi/mimo-v2-flash"

/**
 * Get model by ID
 */
export function getModelById(id: string): LLMModel | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id)
}

/**
 * Get model name for display
 */
export function getModelName(id: string): string {
  const model = getModelById(id)
  return model ? model.name : id.split("/").pop() || id
}

/**
 * Validate if a model ID is valid
 */
export function isValidModel(id: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === id)
}
