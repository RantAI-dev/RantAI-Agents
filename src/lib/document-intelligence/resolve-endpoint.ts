import { kb } from "@/lib/kb-runtime/runtime"

/**
 * Where should an entity/relation-extraction chat call go?
 *
 * Priority:
 *   1. Explicit env override (ENTITY_EXTRACTION_LLM_BASE_URL [+ _API_KEY]).
 *   2. The admin-managed provider registry: if the extraction model id is
 *      claimed by an enabled LlmProvider (e.g. a local Ollama/vLLM endpoint
 *      registered in Admin → Models), route to that endpoint with its stored
 *      key — so on-prem deployments can run KB intelligence fully locally by
 *      just setting ENTITY_EXTRACTION_LLM_MODEL to a managed model id.
 *   3. The extractor's configured default (OpenRouter + OPENROUTER_API_KEY).
 */
export function resolveExtractionEndpoint(
  modelId: string,
  fallbackBaseUrl: string,
  fallbackApiKey: string
): { baseUrl: string; apiKey: string } {
  const envBase = process.env.ENTITY_EXTRACTION_LLM_BASE_URL
  if (envBase) {
    return {
      baseUrl: envBase.replace(/\/+$/, ""),
      apiKey: process.env.ENTITY_EXTRACTION_LLM_API_KEY || fallbackApiKey,
    }
  }
  const managed = kb("endpoints").resolveModel(modelId)
  if (managed) return managed
  return { baseUrl: fallbackBaseUrl, apiKey: fallbackApiKey }
}
