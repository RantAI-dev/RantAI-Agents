import "server-only"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { isHouseModel, houseBackendModel } from "./house-models"

// MiniMax powers two SEPARATE things here; don't conflate them:
//   1. House models (white-labeled, e.g. "rantai/swift") — a PRODUCTION feature.
//      getChatProvider() routes those ids to MiniMax and maps them to the real
//      upstream model name; every other id goes to OpenRouter. Requires
//      MINIMAX_API_KEY. See house-models.ts.
//   2. AI_PROVIDER_MODE=minimax — a DEV-ONLY global override that sends ALL
//      traffic to a single pinned MiniMax model (prod-blocked below). Kept for
//      local experiments; not the path house models use.
// International OpenAI-compatible endpoint. (api.minimaxi.com/.chat are the
// China-region hosts.) Override with MINIMAX_BASE_URL if needed.
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1"
const MINIMAX_DEV_GLOBAL_MODEL = "MiniMax-M2.7"

function hasMiniMaxKey(): boolean {
  return !!process.env.MINIMAX_API_KEY
}

function isDevMiniMaxGlobal(): boolean {
  if (process.env.NODE_ENV === "production") return false
  if (process.env.AI_PROVIDER_MODE !== "minimax") return false
  return hasMiniMaxKey()
}

if (process.env.NODE_ENV === "production" && process.env.AI_PROVIDER_MODE === "minimax") {
  throw new Error(
    "[provider] AI_PROVIDER_MODE=minimax must not be active in production. " +
      "Remove this env var from your deployment. House models like 'rantai/swift' " +
      "are the supported production path for MiniMax-backed inference."
  )
}

function createMiniMax() {
  return createOpenAICompatible({
    name: "minimax",
    baseURL: MINIMAX_BASE_URL,
    apiKey: process.env.MINIMAX_API_KEY || "",
  })
}

function createOpenRouterClient() {
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY || "" })
}

/**
 * Returns a model factory `(modelId) => LanguageModel` that routes each id to
 * the correct upstream:
 *   - House ids (e.g. "rantai/swift") → MiniMax (white-labeled), mapped to the
 *     real upstream model name. Requires MINIMAX_API_KEY.
 *   - Everything else → OpenRouter.
 *   - Dev global MiniMax mode → all ids → a single pinned MiniMax model.
 *
 * Call sites pass `resolveModelId(id)`; house ids pass through that unchanged
 * and the provider selection + id mapping happen here, so no call site needs to
 * know about house models.
 */
export function getChatProvider() {
  if (isDevMiniMaxGlobal()) {
    const minimax = createMiniMax()
    return (_id: string) => minimax(MINIMAX_DEV_GLOBAL_MODEL)
  }

  const openrouter = createOpenRouterClient()
  let minimax: ReturnType<typeof createMiniMax> | null = null

  return (modelId: string) => {
    if (isHouseModel(modelId)) {
      if (!hasMiniMaxKey()) {
        throw new Error(
          `[provider] MINIMAX_API_KEY is required to serve house model "${modelId}".`
        )
      }
      minimax ??= createMiniMax()
      return minimax(houseBackendModel(modelId))
    }
    return openrouter(modelId)
  }
}

/**
 * Translate a requested model id to the id handed to the provider factory.
 * House ids pass through unchanged (getChatProvider maps them internally).
 * Only the dev-only global MiniMax override rewrites the id here.
 */
export function resolveModelId(originalId: string): string {
  if (isDevMiniMaxGlobal()) return MINIMAX_DEV_GLOBAL_MODEL
  return originalId
}
