/**
 * Direct OpenAI-compatible chat calls to the practice models.
 *
 * Practice needs `response_format: json_schema`, which the AI SDK chat path has
 * no way to pass through, so these calls go straight to the provider's
 * `/chat/completions`. The endpoint comes from the provider registry: a model id
 * maps to an LlmProvider holding its baseUrl and key.
 */
import { ensureProviderRegistryLoaded, getProviderRegistry } from "@/lib/llm/provider-registry"

export interface ModelEndpoint {
  baseUrl: string
  apiKey: string | null
  model: string
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

/** Why a chat call failed. "empty" = a 200 reply with no content at all. */
export type ChatFailure = "timeout" | "http" | "network" | "empty" | "aborted"

export type ChatJsonResult =
  | { ok: true; text: string }
  | { ok: false; failure: ChatFailure }

/** The registry entry serving `model`, or null when no provider with a baseUrl serves it. */
export async function resolveEndpoint(model: string): Promise<ModelEndpoint | null> {
  await ensureProviderRegistryLoaded()
  const registry = getProviderRegistry()
  const provider = registry.providers.get(registry.modelProvider.get(model) ?? "")
  if (!provider?.baseUrl) return null
  return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model }
}

function extraBody(): Record<string, unknown> {
  // Only the template switches apply to a non-streaming call; stream_options
  // alongside stream:false is rejected by vLLM.
  try {
    const parsed = JSON.parse(process.env.LLM_EXTRA_BODY || "{}")
    const kwargs = parsed?.chat_template_kwargs
    return kwargs && typeof kwargs === "object" ? { chat_template_kwargs: kwargs } : {}
  } catch {
    return {}
  }
}

/**
 * One structured chat call. Never throws: the result says whether the reply
 * came back and, when it did not, why (timeout, HTTP error, network error,
 * empty content, or the caller's own AbortSignal firing) — callers decide
 * whether to retry or skip, and the engine counts the failures it is told
 * about. `signal` aborts an in-flight call when the client disconnects.
 */
export async function chatJson(
  endpoint: ModelEndpoint,
  messages: ChatMessage[],
  opts: { temperature: number; maxTokens: number; schemaName: string; schema: unknown; timeoutMs: number; signal?: AbortSignal },
): Promise<ChatJsonResult> {
  const timeout = AbortSignal.timeout(opts.timeoutMs)
  const signal = opts.signal
    ? typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeout, opts.signal])
      : timeout
    : timeout
  try {
    const res = await fetch(`${endpoint.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
      },
      signal,
      body: JSON.stringify({
        model: endpoint.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        messages,
        response_format: { type: "json_schema", json_schema: { name: opts.schemaName, schema: opts.schema } },
        ...extraBody(),
      }),
    })
    if (!res.ok) {
      console.warn(`[V1 Practice] ${endpoint.model} returned ${res.status}`)
      return { ok: false, failure: "http" }
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const text = body.choices?.[0]?.message?.content
    return text ? { ok: true, text } : { ok: false, failure: "empty" }
  } catch (err) {
    const name = (err as Error)?.name ?? ""
    if (opts.signal?.aborted || name === "AbortError") return { ok: false, failure: "aborted" }
    if (name === "TimeoutError") return { ok: false, failure: "timeout" }
    console.warn(`[V1 Practice] ${endpoint.model} call failed: ${(err as Error).message?.slice(0, 120)}`)
    return { ok: false, failure: "network" }
  }
}
