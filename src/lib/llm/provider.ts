import "server-only"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { isHouseModel, houseBackendModel } from "./house-models"
import { getProviderRegistry, type ManagedProvider } from "./provider-registry"

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

function createOpenRouterClient(apiKey?: string) {
  return createOpenRouter({ apiKey: apiKey || process.env.OPENROUTER_API_KEY || "" })
}

/**
 * Extra fields merged into every chat request sent to a managed
 * openai_compatible endpoint, as JSON in `LLM_EXTRA_BODY`.
 *
 * This exists for hybrid reasoning models served through a pass-through proxy.
 * SEA-LION v3.5-R decides whether to "think" from a chat-template flag, and when
 * thinking is on it spends its output budget narrating its plan — which our
 * answer path then has to strip, and which shows up as a truncated non-answer if
 * the stream is cut before the real reply starts. Turning it off upstream is
 * strictly better than deleting it downstream: no wasted tokens, nothing to leak.
 *
 * Set per deployment, e.g.
 *   LLM_EXTRA_BODY={"chat_template_kwargs":{"thinking_mode":"off"}}
 * Unset (the default) means the request body is untouched.
 */
function managedExtraBody(): Record<string, unknown> | null {
  const raw = process.env.LLM_EXTRA_BODY
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    console.warn("[provider] LLM_EXTRA_BODY is not valid JSON — ignored")
    return null
  }
}

/**
 * Merge `extra` into a JSON request body, respecting per-field legality.
 *
 * Exported for tests: the stream-only rule below is the kind of thing that
 * silently turns every non-streaming call into a 400 if it regresses.
 * Returns the original string unchanged when there is nothing to do or the
 * body is not parseable JSON.
 */
export function mergeExtraBody(
  bodyStr: string,
  extra: Record<string, unknown> | null
): string {
  if (!extra) return bodyStr
  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse(bodyStr)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return bodyStr
    body = parsed as Record<string, unknown>
  } catch {
    return bodyStr
  }
  const add = { ...extra }
  // `stream_options` is only legal alongside `stream: true` — vLLM rejects the
  // pair outright ("Stream options can only be defined when stream=True").
  // Injecting it blindly would turn every non-streaming call through this
  // provider into a 400, so it is dropped unless this request really streams.
  if (body.stream !== true) delete add.stream_options
  return JSON.stringify({ ...body, ...add })
}

function createManagedClient(p: ManagedProvider) {
  const extra = managedExtraBody()

  // The SDK has no per-provider "extra body" hook, so merge at the transport
  // seam. Only JSON bodies are touched; anything else passes through untouched.
  const fetchWithExtraBody: typeof fetch = async (input, init) => {
    if (!extra || !init?.body || typeof init.body !== "string") {
      return fetch(input, init)
    }
    return fetch(input, { ...init, body: mergeExtraBody(init.body, extra) })
  }

  return createOpenAICompatible({
    name: p.name,
    baseURL: p.baseUrl || "",
    apiKey: p.apiKey || "",
    ...(extra && { fetch: fetchWithExtraBody }),
  })
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

  // Admin-managed providers (LlmProvider table): a model claimed by a managed
  // openai_compatible provider is served from that endpoint with its stored
  // key; a managed openrouter-type provider's key overrides the env key.
  // Empty registry (no rows) → exact pre-existing env behavior.
  const registry = getProviderRegistry()
  const openrouter = createOpenRouterClient(registry.openrouter?.apiKey ?? undefined)
  let minimax: ReturnType<typeof createMiniMax> | null = null
  const managedClients = new Map<string, ReturnType<typeof createManagedClient>>()

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
    const managedId = registry.modelProvider.get(modelId)
    if (managedId) {
      const p = registry.providers.get(managedId)
      if (p && p.type === "openai_compatible" && p.baseUrl) {
        let client = managedClients.get(p.id)
        if (!client) {
          client = createManagedClient(p)
          managedClients.set(p.id, client)
        }
        return client(modelId)
      }
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
