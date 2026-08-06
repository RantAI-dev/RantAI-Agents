/**
 * Inference providers for IKAT-Bench.
 *
 * The systems under test can be served two ways:
 *
 *   IKAT_PROVIDER=openrouter  hosted models (development convenience)
 *   IKAT_PROVIDER=ugm         the partner's on-premise box — ollama for
 *                             generation and vision, TEI for embeddings
 *
 * The on-premise path is not a fallback, it is the deployment the paper argues
 * for: an air-gapped GPU box running an open Southeast-Asian language model,
 * with no commercial API in the serving path. Running the benchmark there makes
 * the cost claim in C3 a measurement rather than an extrapolation.
 *
 * The JUDGE deliberately does NOT come through here. It must stay on a model
 * from a different vendor than anything under test (see judge.ts
 * `assertJudgeIndependence`), and every local model available on the box is a
 * Qwen/SEA-LION variant — judging SEA-LION output with SEA-LION would be exactly
 * the self-preference the guard exists to prevent.
 */
import { chat as orChat, embed as orEmbed, type ChatOut } from "../lib"

export type Provider = "openrouter" | "ugm"

export const PROVIDER: Provider = (process.env.IKAT_PROVIDER as Provider) ?? "openrouter"

/** ollama, reachable from inside the partner's docker network. */
const OLLAMA_BASE = process.env.IKAT_OLLAMA_BASE ?? "http://ollama:11434"
/** HF text-embeddings-inference serving BAAI/bge-m3. */
const TEI_BASE = process.env.IKAT_TEI_BASE ?? "http://tei-embed:80"

// ── Chat ───────────────────────────────────────────────────────────────────

/**
 * ollama's OpenAI-compatible chat endpoint.
 *
 * Multimodal messages use the same `image_url` content parts as the hosted path,
 * so the figure-description prompt is byte-identical across providers and the
 * two runs stay comparable.
 */
async function ollamaChat(model: string, messages: unknown[], maxTokens: number): Promise<ChatOut> {
  const t0 = Date.now()
  const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0 }),
  })
  const ms = Date.now() - t0
  if (!res.ok) throw new Error(`ollama ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { completion_tokens?: number }
  }
  return { text: data.choices?.[0]?.message?.content ?? "", ms, usage: data.usage }
}

/** Generation for the systems under test. */
export function genChat(model: string, messages: unknown[], maxTokens = 900): Promise<ChatOut> {
  return PROVIDER === "ugm"
    ? ollamaChat(model, messages, maxTokens)
    : orChat(model, messages as never[], maxTokens)
}

// ── Embeddings ─────────────────────────────────────────────────────────────

/**
 * TEI's /embed endpoint. Returns bare `number[][]`, unlike the OpenAI shape.
 *
 * TEI enforces a max client batch size, so callers must keep batches small; the
 * caller-side batching in systems.ts already does.
 */
async function teiEmbed(input: string | string[]): Promise<{ vectors: number[][]; dim: number; ms: number }> {
  const inputs = Array.isArray(input) ? input : [input]
  const t0 = Date.now()
  const res = await fetch(`${TEI_BASE}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Long textbook chunks exceed bge-m3's window; truncating server-side is
    // preferable to a 413 that would silently drop the chunk from the index.
    body: JSON.stringify({ inputs, truncate: true }),
  })
  const ms = Date.now() - t0
  if (!res.ok) throw new Error(`tei embed ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const vectors = (await res.json()) as number[][]
  return { vectors, dim: vectors[0]?.length ?? 0, ms }
}

export function genEmbed(
  model: string,
  input: string | string[],
): Promise<{ vectors: number[][]; dim: number; ms: number }> {
  return PROVIDER === "ugm" ? teiEmbed(input) : orEmbed(model, input)
}

/** Human-readable provider description for the results header. */
export function providerInfo(): Record<string, string> {
  return PROVIDER === "ugm"
    ? { provider: "ugm", chat: OLLAMA_BASE, embed: TEI_BASE }
    : { provider: "openrouter", chat: "openrouter", embed: "openrouter" }
}
