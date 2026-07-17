/**
 * Managed LLM provider administration (LlmProvider table): CRUD, connection
 * test, and model discovery for OpenAI-compatible endpoints (vLLM, Ollama via
 * /v1, TGI, LM Studio, ...). API keys are AES-256-GCM encrypted at rest and
 * never returned — GETs expose only a `keyHint` (last 4 chars).
 */
import { prisma } from "@/lib/prisma"
import { encryptCredential, decryptCredential } from "@/lib/workflow/credentials"
import { invalidateProviderRegistry } from "@/lib/llm/provider-registry"
import { writeAdminAudit, type AdminActor } from "./audit"

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

export interface ProviderInput {
  name?: string
  type?: "openrouter" | "openai_compatible"
  baseUrl?: string | null
  /** New API key to store; undefined/empty = keep the existing one. */
  apiKey?: string
  enabled?: boolean
}

function keyHint(encrypted: string | null): string | null {
  if (!encrypted) return null
  try {
    const key = decryptCredential(encrypted).apiKey
    if (typeof key !== "string" || key.length < 6) return "****"
    return `${key.slice(0, 3)}…${key.slice(-4)}`
  } catch {
    return "****"
  }
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null
  const trimmed = baseUrl.trim().replace(/\/+$/, "")
  return trimmed || null
}

function toPublic(p: {
  id: string
  name: string
  type: string
  baseUrl: string | null
  encryptedApiKey: string | null
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    keyHint: keyHint(p.encryptedApiKey),
    enabled: p.enabled,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

export async function listProviders() {
  const rows = await prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } })
  const counts = await prisma.llmModel.groupBy({
    by: ["providerId"],
    where: { providerId: { not: null } },
    _count: true,
  })
  const countBy = new Map(counts.map((c) => [c.providerId as string, c._count]))
  return rows.map((p) => ({ ...toPublic(p), modelCount: countBy.get(p.id) ?? 0 }))
}

/** Storing keys needs CREDENTIAL_ENCRYPTION_KEY — surface a clear error, not a 500. */
function encryptionAvailable(): string | null {
  if (process.env.CREDENTIAL_ENCRYPTION_KEY) return null
  return "CREDENTIAL_ENCRYPTION_KEY is not set on this deployment — set it before storing provider API keys"
}

export async function createProvider(actor: AdminActor, input: ProviderInput) {
  const type = input.type === "openrouter" ? "openrouter" : "openai_compatible"
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  if (!input.name?.trim()) return { error: "Name is required" }
  if (type === "openai_compatible" && !baseUrl) {
    return { error: "Base URL is required for OpenAI-compatible providers" }
  }
  if (input.apiKey) {
    const err = encryptionAvailable()
    if (err) return { error: err }
  }
  const row = await prisma.llmProvider.create({
    data: {
      name: input.name.trim(),
      type,
      baseUrl: type === "openrouter" ? null : baseUrl,
      encryptedApiKey: input.apiKey ? encryptCredential({ apiKey: input.apiKey }) : null,
      enabled: input.enabled ?? true,
    },
  })
  await invalidateProviderRegistry()
  await writeAdminAudit({
    actor,
    action: "provider.create",
    targetType: "provider",
    targetId: row.id,
    targetLabel: row.name,
    metadata: { type, baseUrl: row.baseUrl },
  })
  return { provider: toPublic(row) }
}

export async function updateProvider(actor: AdminActor, id: string, input: ProviderInput) {
  const existing = await prisma.llmProvider.findUnique({ where: { id } })
  if (!existing) return { error: "Provider not found" }
  if (input.apiKey) {
    const err = encryptionAvailable()
    if (err) return { error: err }
  }
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.baseUrl !== undefined) data.baseUrl = normalizeBaseUrl(input.baseUrl)
  if (input.enabled !== undefined) data.enabled = input.enabled
  if (input.apiKey) data.encryptedApiKey = encryptCredential({ apiKey: input.apiKey })
  const row = await prisma.llmProvider.update({ where: { id }, data })
  await invalidateProviderRegistry()
  await writeAdminAudit({
    actor,
    action: "provider.update",
    targetType: "provider",
    targetId: id,
    targetLabel: row.name,
    metadata: { changed: Object.keys(data).filter((k) => k !== "encryptedApiKey"), keyRotated: !!input.apiKey },
  })
  return { provider: toPublic(row) }
}

export async function deleteProvider(actor: AdminActor, id: string) {
  const existing = await prisma.llmProvider.findUnique({ where: { id } })
  if (!existing) return { error: "Provider not found" }
  // FK is ON DELETE SET NULL — its models fall back to legacy wiring; drop the
  // discovered ones outright since they only exist on that endpoint.
  await prisma.llmModel.deleteMany({ where: { providerId: id, source: "discovered" } })
  await prisma.llmProvider.delete({ where: { id } })
  await invalidateProviderRegistry()
  await writeAdminAudit({
    actor,
    action: "provider.delete",
    targetType: "provider",
    targetId: id,
    targetLabel: existing.name,
  })
  return { ok: true }
}

function providerModelsUrl(p: { type: string; baseUrl: string | null }): string | null {
  if (p.type === "openrouter") return OPENROUTER_MODELS_URL
  return p.baseUrl ? `${p.baseUrl}/models` : null
}

function providerKey(p: { type: string; encryptedApiKey: string | null }): string {
  if (p.encryptedApiKey) {
    try {
      const key = decryptCredential(p.encryptedApiKey).apiKey
      if (typeof key === "string") return key
    } catch {
      // fall through
    }
  }
  return p.type === "openrouter" ? process.env.OPENROUTER_API_KEY || "" : ""
}

async function fetchModelList(p: {
  type: string
  baseUrl: string | null
  encryptedApiKey: string | null
}): Promise<{ models: { id: string; name?: string; contextWindow?: number }[] } | { error: string }> {
  const url = providerModelsUrl(p)
  if (!url) return { error: "Provider has no base URL" }
  const key = providerKey(p)
  let res: Response
  try {
    res = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    return { error: `Could not reach ${url}: ${err instanceof Error ? err.message : err}` }
  }
  if (!res.ok) return { error: `${url} responded ${res.status} ${res.statusText}` }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { error: "Endpoint did not return JSON — is this an OpenAI-compatible /v1 base URL?" }
  }
  const data = (body as { data?: unknown[] }).data
  if (!Array.isArray(data)) {
    return { error: "Unexpected /models response shape (no data[] array)" }
  }
  const models = data
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .filter((m) => typeof m.id === "string")
    .map((m) => ({
      id: m.id as string,
      name: typeof m.name === "string" ? m.name : undefined,
      contextWindow:
        typeof m.context_length === "number"
          ? m.context_length
          : typeof (m as { max_model_len?: number }).max_model_len === "number"
            ? (m as { max_model_len?: number }).max_model_len
            : undefined,
    }))
  return { models }
}

/** GET the provider's /models endpoint to prove URL + key work. */
export async function testProvider(id: string) {
  const p = await prisma.llmProvider.findUnique({ where: { id } })
  if (!p) return { error: "Provider not found" }
  const result = await fetchModelList(p)
  if ("error" in result) return result
  return { ok: true, modelCount: result.models.length }
}

/**
 * Discover models from the endpoint's /models and upsert them into LlmModel
 * (source "discovered") linked to this provider. Models that disappeared from
 * the endpoint are removed again.
 */
export async function discoverProviderModels(actor: AdminActor, id: string) {
  const p = await prisma.llmProvider.findUnique({ where: { id } })
  if (!p) return { error: "Provider not found" }
  if (p.type === "openrouter") {
    return { error: "OpenRouter models come from the catalog sync, not discovery" }
  }
  const result = await fetchModelList(p)
  if ("error" in result) return result

  const seenIds: string[] = []
  for (const m of result.models) {
    seenIds.push(m.id)
    await prisma.llmModel.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        name: m.name || m.id,
        provider: p.name,
        providerSlug: m.id.includes("/") ? m.id.split("/")[0] : p.name.toLowerCase().replace(/\s+/g, "-"),
        contextWindow: m.contextWindow ?? 0,
        pricingInput: 0,
        pricingOutput: 0,
        hasToolCalling: true, // OpenAI-compatible servers generally accept tools; admin can toggle off
        providerId: p.id,
        source: "discovered",
      },
      update: {
        provider: p.name,
        contextWindow: m.contextWindow ?? undefined,
        providerId: p.id,
        isActive: true,
        lastSeenAt: new Date(),
      },
    })
  }
  const removed = await prisma.llmModel.deleteMany({
    where: { providerId: p.id, source: "discovered", id: { notIn: seenIds } },
  })
  await invalidateProviderRegistry()
  await writeAdminAudit({
    actor,
    action: "provider.discover",
    targetType: "provider",
    targetId: p.id,
    targetLabel: p.name,
    metadata: { discovered: seenIds.length, removed: removed.count },
  })
  return { ok: true, discovered: seenIds.length, removed: removed.count }
}
