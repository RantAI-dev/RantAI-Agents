import type { RetrievalResult } from "@/lib/rag/retriever"

/**
 * Client for a standalone RantAI KB service (github.com/RantAI-dev/rantai-kb).
 *
 * The app can run the knowledge base two ways:
 *
 *   in-process  — the engine under lib/rag + lib/ingest, using this app's
 *                 Postgres/SurrealDB/S3. The default; nothing to deploy.
 *   remote      — a separate KB service over HTTP, so several products can
 *                 share one knowledge base. Enabled by setting KB_SERVICE_URL.
 *
 * Both paths return the same shapes, because the service exposes the same
 * engine. Call sites go through `lib/kb-client/facade`, not this module.
 */

export interface KbClientConfig {
  baseUrl: string
  apiKey: string
  /** Retrieval sits on the answer path, so it must fail fast. */
  timeoutMs: number
}

export function kbServiceConfig(): KbClientConfig | null {
  const baseUrl = process.env.KB_SERVICE_URL
  if (!baseUrl) return null
  const apiKey = process.env.KB_SERVICE_API_KEY
  if (!apiKey) {
    console.warn("[kb-client] KB_SERVICE_URL is set but KB_SERVICE_API_KEY is not — falling back to in-process KB")
    return null
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    timeoutMs: Number(process.env.KB_SERVICE_TIMEOUT_MS) || 30_000,
  }
}

async function request<T>(
  cfg: KbClientConfig,
  path: string,
  init: RequestInit & { formData?: FormData } = {}
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${cfg.apiKey}`)
    if (init.body && !init.formData) headers.set("content-type", "application/json")

    const res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      body: init.formData ?? init.body,
      headers,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`KB service ${res.status} on ${path}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export interface RemoteSearchOptions {
  maxChunks?: number
  knowledgeBaseIds?: string[]
  documentIds?: string[]
  category?: string
  hybrid?: boolean
}

export async function remoteSearch(
  cfg: KbClientConfig,
  query: string,
  options: RemoteSearchOptions = {}
): Promise<RetrievalResult> {
  const result = await request<RetrievalResult>(cfg, "/v1/search", {
    method: "POST",
    body: JSON.stringify({ query, ...options }),
  })
  // A service that returns nothing must look like "no results", not a crash.
  return {
    context: result?.context ?? "",
    sources: result?.sources ?? [],
    chunks: result?.chunks ?? [],
  } as RetrievalResult
}

export interface RemoteIngestInput {
  file: File
  title?: string
  categories?: string[]
  subcategory?: string | null
  knowledgeBaseIds?: string[]
  /** Who asked for this, in the caller's own id space. */
  externalRef?: string | null
  figureMode?: string
}

export interface RemoteIngestResult {
  id: string
  jobId: string | null
  status: string
  title: string
}

export async function remoteIngest(
  cfg: KbClientConfig,
  input: RemoteIngestInput
): Promise<RemoteIngestResult> {
  const form = new FormData()
  form.set("file", input.file)
  if (input.title) form.set("title", input.title)
  if (input.categories?.length) form.set("categories", JSON.stringify(input.categories))
  if (input.subcategory) form.set("subcategory", input.subcategory)
  if (input.knowledgeBaseIds?.length) form.set("knowledgeBaseIds", JSON.stringify(input.knowledgeBaseIds))
  if (input.externalRef) form.set("externalRef", input.externalRef)
  if (input.figureMode && input.figureMode !== "auto") form.set("figures", input.figureMode)

  return request<RemoteIngestResult>(cfg, "/v1/documents", {
    method: "POST",
    formData: form,
    // Uploads are large and the service answers 202 as soon as bytes land, but
    // a slow link still needs more than the retrieval budget.
    })
}

export interface RemoteJobStatus {
  id: string
  status: string
  step: string | null
  progress: number
  stepCurrent: number | null
  stepTotal: number | null
  etaSeconds: number | null
  error: string | null
  documentId: string | null
}

export async function remoteJobStatus(cfg: KbClientConfig, jobId: string): Promise<RemoteJobStatus> {
  return request<RemoteJobStatus>(cfg, `/v1/jobs/${encodeURIComponent(jobId)}`, { method: "GET" })
}

export async function remoteHealth(cfg: KbClientConfig): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(cfg, "/health", { method: "GET" })
}
