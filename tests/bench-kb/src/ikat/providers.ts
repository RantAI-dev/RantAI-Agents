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

export type Provider = "openrouter" | "ugm" | "mistral"

export const PROVIDER: Provider = (process.env.IKAT_PROVIDER as Provider) ?? "openrouter"

/** Mistral: a second hosted path, used because its key outlived the OpenRouter
 *  credit. Chat, embeddings and vision all come from one provider, so a run can
 *  complete without touching the exhausted account. */
const MISTRAL_BASE = process.env.IKAT_MISTRAL_BASE ?? "https://api.mistral.ai"
const MISTRAL_KEY = () => process.env.KB_MISTRAL_OCR_KEY ?? ""

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

/**
 * Mistral's chat endpoint. OpenAI-shaped, except that image parts must be
 * `image_url: "<url>"` (a bare string) rather than `{ url }` — passing the
 * object silently yields a text-only completion, which would quietly turn the
 * vision-dependent parts of the benchmark into text-only ones.
 */
async function mistralChat(model: string, messages: unknown[], maxTokens: number): Promise<ChatOut> {
  const fixed = (messages as Array<{ role: string; content: unknown }>).map((m) => {
    if (!Array.isArray(m.content)) return m
    return {
      ...m,
      content: (m.content as Array<Record<string, unknown>>).map((part) =>
        part.type === "image_url" && typeof part.image_url === "object"
          ? { type: "image_url", image_url: (part.image_url as { url: string }).url }
          : part,
      ),
    }
  })

  const t0 = Date.now()
  const res = await fetch(`${MISTRAL_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MISTRAL_KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: fixed, max_tokens: maxTokens, temperature: 0 }),
  })
  const ms = Date.now() - t0
  if (!res.ok) throw new Error(`mistral ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { completion_tokens?: number }
  }
  return { text: data.choices?.[0]?.message?.content ?? "", ms, usage: data.usage }
}

/**
 * Conservative character budget per embedding input.
 *
 * mistral-embed caps at 8192 tokens and rejects the whole BATCH when one item
 * exceeds it. Our chunker splits only at layout-block boundaries, so a single
 * oversized block (a full-page table, a long activity list) becomes a single
 * oversized chunk. Indonesian tokenizes at roughly 1.2 characters per token
 * here — measured, not assumed: a 12k-character input came back as 9,960 tokens
 * — so 7k characters (~5.8k tokens) leaves real margin under the 8,192 cap.
 * Truncation applies ONLY to the text sent to the embedder; the chunk text used
 * for generation and for the metrics is untouched.
 */
const EMBED_CHAR_BUDGET = 7000

async function mistralEmbed(input: string | string[]): Promise<{ vectors: number[][]; dim: number; ms: number }> {
  const inputs = (Array.isArray(input) ? input : [input]).map((t) =>
    t.length > EMBED_CHAR_BUDGET ? t.slice(0, EMBED_CHAR_BUDGET) : t,
  )
  const t0 = Date.now()
  const res = await fetch(`${MISTRAL_BASE}/v1/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MISTRAL_KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.IKAT_MISTRAL_EMBED ?? "mistral-embed", input: inputs }),
  })
  const ms = Date.now() - t0
  if (!res.ok) throw new Error(`mistral embed ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> }
  const vectors = data.data.map((d) => d.embedding)
  return { vectors, dim: vectors[0]?.length ?? 0, ms }
}

/** Generation for the systems under test. */
export function genChat(model: string, messages: unknown[], maxTokens = 900): Promise<ChatOut> {
  if (PROVIDER === "ugm") return ollamaChat(model, messages, maxTokens)
  if (PROVIDER === "mistral") return mistralChat(model, messages, maxTokens)
  return orChat(model, messages as never[], maxTokens)
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
  if (PROVIDER === "ugm") return teiEmbed(input)
  if (PROVIDER === "mistral") return mistralEmbed(input)
  return orEmbed(model, input)
}

/** Human-readable provider description for the results header. */
export function providerInfo(): Record<string, string> {
  if (PROVIDER === "ugm") return { provider: "ugm", chat: OLLAMA_BASE, embed: TEI_BASE }
  if (PROVIDER === "mistral")
    return { provider: "mistral", chat: MISTRAL_BASE, embed: process.env.IKAT_MISTRAL_EMBED ?? "mistral-embed" }
  return { provider: "openrouter", chat: "openrouter", embed: "openrouter" }
}
