import "server-only"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

// === REMOVAL CHECKLIST (when removing MiniMax dev mode) ===
// 1. Remove the createOpenAICompatible import above.
// 2. Remove MINIMAX_BASE_URL, MINIMAX_FALLBACK_MODEL, isDevMiniMax().
// 3. Simplify getChatProvider() to: return createOpenRouter({ apiKey: ... }).
// 4. Simplify resolveModelId(id) to: return id.
// 5. Remove AI_PROVIDER_MODE & MINIMAX_API_KEY from .env and .env.example.
// 6. bun remove @ai-sdk/openai-compatible
// 7. Done. No call site changes needed.
// See docs/artifact-plans/minimax-dev-mode-plan.md for full context.

const MINIMAX_BASE_URL = "https://api.minimaxi.chat/v1"
const MINIMAX_FALLBACK_MODEL = "MiniMax-M2.7"

function isDevMiniMax(): boolean {
  if (process.env.NODE_ENV === "production") return false
  if (process.env.AI_PROVIDER_MODE !== "minimax") return false
  if (!process.env.MINIMAX_API_KEY) return false
  return true
}

if (process.env.NODE_ENV === "production" && process.env.AI_PROVIDER_MODE === "minimax") {
  throw new Error(
    "[provider] AI_PROVIDER_MODE=minimax must not be active in production. " +
      "Remove this env var from your deployment."
  )
}

let loggedMode = false

export function getChatProvider() {
  if (isDevMiniMax()) {
    if (!loggedMode && process.env.NODE_ENV !== "test") {
      console.log("[provider] mode=minimax (dev) baseURL=" + MINIMAX_BASE_URL)
      loggedMode = true
    }
    return createOpenAICompatible({
      name: "minimax",
      baseURL: MINIMAX_BASE_URL,
      apiKey: process.env.MINIMAX_API_KEY!,
    })
  }
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY || "" })
}

export function resolveModelId(originalId: string): string {
  if (isDevMiniMax()) return MINIMAX_FALLBACK_MODEL
  return originalId
}
