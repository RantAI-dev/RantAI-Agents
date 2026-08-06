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
import * as fs from "node:fs"
import * as path from "node:path"
import { createHash } from "node:crypto"
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


/**
 * Retry on rate limits and transient server errors, with exponential backoff.
 *
 * An unattended benchmark sweep makes thousands of calls; a single 429 partway
 * through would otherwise lose the whole run. Only 429 and 5xx are retried —
 * a 400 (bad request) or 401 (bad key) is a bug or a config error and must
 * surface immediately rather than be retried into a long silence.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const retryable = /\b(429|500|502|503|504)\b/.test(msg) || /rate.?limit/i.test(msg)
      if (!retryable || i === attempts - 1) throw err
      // 2s, 4s, 8s, 16s, 32s — long enough for a per-minute quota to roll over.
      const wait = 2000 * 2 ** i
      console.warn(`[ikat] ${label} retry ${i + 1}/${attempts - 1} in ${wait}ms: ${msg.slice(0, 90)}`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

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
  const res = await withRetry("mistral chat", () => fetch(`${MISTRAL_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MISTRAL_KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: fixed, max_tokens: maxTokens, temperature: 0 }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`mistral ${model} ${r.status}: ${(await r.text()).slice(0, 300)}`)
    return r
  }))
  const ms = Date.now() - t0
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
  const res = await withRetry("mistral embed", () => fetch(`${MISTRAL_BASE}/v1/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MISTRAL_KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.IKAT_MISTRAL_EMBED ?? "mistral-embed", input: inputs }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`mistral embed ${r.status}: ${(await r.text()).slice(0, 300)}`)
    return r
  }))
  const ms = Date.now() - t0
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


// ── Embedding cache ────────────────────────────────────────────────────────

/**
 * Disk cache for embeddings, keyed by (model, text).
 *
 * Embedding is by far the highest-volume call in a sweep — 3,137 chunks before a
 * single question is asked — and it is perfectly deterministic, so recomputing
 * it on every run is pure waste. More importantly it is what makes the benchmark
 * survive a flaky provider: a run that dies to a quota error resumes from the
 * cache in seconds instead of re-spending the whole index.
 *
 * Written through on every batch, so even a hard kill keeps what it earned.
 */
const CACHE_DIR = path.resolve(import.meta.dirname, "../..", "corpus", "embed-cache")

let cacheFile: string | null = null
let cache: Record<string, number[]> | null = null
let pendingWrites = 0

function keyFor(model: string, text: string): string {
  return createHash("sha1").update(`${model}\u0000${text}`).digest("hex")
}

function loadCache(model: string): Record<string, number[]> {
  const file = path.join(CACHE_DIR, `${model.replace(/[^\w.-]/g, "_")}.json`)
  if (cache && cacheFile === file) return cache
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  cacheFile = file
  cache = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, number[]>) : {}
  return cache
}

function flushCache(force = false): void {
  if (!cache || !cacheFile) return
  if (!force && pendingWrites < 32) return
  fs.writeFileSync(cacheFile, JSON.stringify(cache))
  pendingWrites = 0
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

function embedUncached(
  model: string,
  input: string[],
): Promise<{ vectors: number[][]; dim: number; ms: number }> {
  if (PROVIDER === "ugm") return teiEmbed(input)
  if (PROVIDER === "mistral") return mistralEmbed(input)
  return orEmbed(model, input)
}

/**
 * Embed with a read-through disk cache. Only the texts missing from the cache
 * reach the provider, and results are merged back in the caller's order.
 */
export async function genEmbed(
  model: string,
  input: string | string[],
): Promise<{ vectors: number[][]; dim: number; ms: number }> {
  const texts = Array.isArray(input) ? input : [input]
  const c = loadCache(model)

  const missIdx: number[] = []
  const out: (number[] | undefined)[] = texts.map((t, i) => {
    const hit = c[keyFor(model, t)]
    if (hit) return hit
    missIdx.push(i)
    return undefined
  })

  let ms = 0
  if (missIdx.length) {
    const res = await embedUncached(
      model,
      missIdx.map((i) => texts[i]),
    )
    ms = res.ms
    missIdx.forEach((srcIdx, k) => {
      const v = res.vectors[k]
      out[srcIdx] = v
      c[keyFor(model, texts[srcIdx])] = v
      pendingWrites++
    })
    flushCache()
  }

  const vectors = out.map((v) => v ?? [])
  return { vectors, dim: vectors[0]?.length ?? 0, ms }
}

/** Persist anything still buffered. Callers should invoke this before exiting. */
export function flushEmbedCache(): void {
  flushCache(true)
}

/** Human-readable provider description for the results header. */
export function providerInfo(): Record<string, string> {
  if (PROVIDER === "ugm") return { provider: "ugm", chat: OLLAMA_BASE, embed: TEI_BASE }
  if (PROVIDER === "mistral")
    return { provider: "mistral", chat: MISTRAL_BASE, embed: process.env.IKAT_MISTRAL_EMBED ?? "mistral-embed" }
  return { provider: "openrouter", chat: "openrouter", embed: "openrouter" }
}
