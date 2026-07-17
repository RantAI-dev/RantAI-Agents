/**
 * KB/RAG configuration from the admin UI, persisted in
 * PlatformSetting["kb_config"] and merged over env by getRagConfig().
 *
 * Embedding model/dimension changes are DANGEROUS: existing vectors were
 * written with the old model, so retrieval degrades (and a dim change breaks
 * the vector store) until documents are re-embedded. The API refuses those
 * changes unless the caller passes confirmEmbeddingChange: true (the UI
 * requires typed confirmation before setting it).
 */
import { prisma } from "@/lib/prisma"
import { getRagConfig, envRagConfig, type RagConfig } from "@/lib/rag/config"
import {
  KB_CONFIG_SETTING_KEY,
  invalidateKbOverrides,
} from "@/lib/rag/config-overrides"
import { writeAdminAudit, type AdminActor } from "./audit"

/** Secret-valued RagConfig keys — GETs return only set/unset, never the value. */
const SECRET_KEYS: (keyof RagConfig)[] = ["embeddingApiKey", "extractVisionApiKey"]

const EDITABLE: (keyof RagConfig)[] = [
  "extractPrimary",
  "extractFallback",
  "extractSmartFallback",
  "extractVisionBaseUrl",
  "extractVisionApiKey",
  "extractMineruBaseUrl",
  "embeddingModel",
  "embeddingDim",
  "embeddingBaseUrl",
  "embeddingApiKey",
  "defaultMaxChunks",
  "rerankEnabled",
  "rerankModel",
  "rerankInitialK",
  "rerankFinalK",
]

async function readOverrides(): Promise<Record<string, unknown>> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KB_CONFIG_SETTING_KEY } })
  return row && row.value && typeof row.value === "object" ? { ...(row.value as Record<string, unknown>) } : {}
}

/**
 * Effective KB config + per-field source ("db" | "env" | "default") so the UI
 * can show where each value comes from. Secret values are masked.
 */
export async function getKbSettings() {
  const overrides = await readOverrides()
  const effective = getRagConfig()
  const fromEnvOrDefault = envRagConfig()
  const embeddingProviderId =
    typeof overrides.embeddingProviderId === "string" ? overrides.embeddingProviderId : null

  const fields = EDITABLE.map((key) => {
    const overridden = overrides[key] !== undefined && overrides[key] !== null && overrides[key] !== ""
    const secret = SECRET_KEYS.includes(key)
    const effectiveValue = overridden ? overrides[key] : fromEnvOrDefault[key]
    // While an embedding provider is linked, endpoint + key are derived from
    // it at runtime — surface that instead of the stored/env value.
    const derived =
      !!embeddingProviderId && (key === "embeddingBaseUrl" || key === "embeddingApiKey")
    return {
      key,
      source: derived ? "provider" : overridden ? "db" : envSource(key),
      secret,
      value: secret ? undefined : derived ? effective[key] : effectiveValue,
      set: secret ? !!effective[key] : undefined,
    }
  })
  return { fields, embeddingProviderId, effective: redactSecrets(effective) }
}

function redactSecrets(config: RagConfig): Omit<RagConfig, "embeddingApiKey" | "extractVisionApiKey"> & {
  embeddingApiKeySet: boolean
  extractVisionApiKeySet: boolean
} {
  const { embeddingApiKey, extractVisionApiKey, ...rest } = config
  return {
    ...rest,
    embeddingApiKeySet: !!embeddingApiKey,
    extractVisionApiKeySet: !!extractVisionApiKey,
  }
}

const ENV_BY_KEY: Partial<Record<keyof RagConfig, string>> = {
  extractPrimary: "KB_EXTRACT_PRIMARY",
  extractFallback: "KB_EXTRACT_FALLBACK",
  extractSmartFallback: "KB_EXTRACT_SMART_FALLBACK",
  extractVisionBaseUrl: "KB_EXTRACT_VISION_BASE_URL",
  extractVisionApiKey: "KB_EXTRACT_VISION_API_KEY",
  extractMineruBaseUrl: "KB_EXTRACT_MINERU_BASE_URL",
  embeddingModel: "KB_EMBEDDING_MODEL",
  embeddingDim: "KB_EMBEDDING_DIM",
  embeddingBaseUrl: "KB_EMBEDDING_BASE_URL",
  embeddingApiKey: "KB_EMBEDDING_API_KEY",
  defaultMaxChunks: "KB_DEFAULT_MAX_CHUNKS",
  rerankEnabled: "KB_RERANK_ENABLED",
  rerankModel: "KB_RERANK_MODEL",
  rerankInitialK: "KB_RERANK_INITIAL_K",
  rerankFinalK: "KB_RERANK_FINAL_K",
}

function envSource(key: keyof RagConfig): "env" | "default" {
  const envName = ENV_BY_KEY[key]
  return envName && process.env[envName] ? "env" : "default"
}

const INT_KEYS: (keyof RagConfig)[] = [
  "embeddingDim",
  "defaultMaxChunks",
  "rerankInitialK",
  "rerankFinalK",
]
const BOOL_KEYS: (keyof RagConfig)[] = ["rerankEnabled"]

export async function updateKbSettings(
  actor: AdminActor,
  updates: Record<string, unknown>,
  options: { confirmEmbeddingChange?: boolean } = {}
): Promise<{ ok: true } | { error: string; requiresEmbeddingConfirmation?: boolean }> {
  const overrides = await readOverrides()
  const before = getRagConfig()
  const changed: string[] = []

  // Embedding source: link/unlink a managed LlmProvider. null = back to manual.
  if ("embeddingProviderId" in updates) {
    const raw = updates.embeddingProviderId
    if (raw === null || raw === "") {
      if (overrides.embeddingProviderId !== undefined) {
        delete overrides.embeddingProviderId
        changed.push("embeddingProviderId")
      }
    } else if (typeof raw === "string") {
      const provider = await prisma.llmProvider.findUnique({ where: { id: raw } })
      if (!provider) return { error: "Embedding provider not found" }
      if (!provider.enabled) return { error: "Embedding provider is disabled" }
      if (provider.type !== "openrouter" && !provider.baseUrl) {
        return { error: "Embedding provider has no base URL" }
      }
      if (overrides.embeddingProviderId !== raw) {
        overrides.embeddingProviderId = raw
        changed.push("embeddingProviderId")
      }
    } else {
      return { error: "embeddingProviderId must be a string or null" }
    }
  }

  for (const key of EDITABLE) {
    if (!(key in updates)) continue
    const raw = updates[key]
    // null clears the DB override → field falls back to env/default.
    if (raw === null || raw === "") {
      if (overrides[key] !== undefined) {
        delete overrides[key]
        changed.push(key)
      }
      continue
    }
    let value: unknown = raw
    if (INT_KEYS.includes(key)) {
      const n = Number(raw)
      if (!Number.isInteger(n) || n <= 0) return { error: `${key} must be a positive integer` }
      value = n
    } else if (BOOL_KEYS.includes(key)) {
      value = raw === true || raw === "true"
    } else if (typeof raw !== "string") {
      return { error: `${key} must be a string` }
    }
    if (overrides[key] !== value) {
      overrides[key] = value
      changed.push(key)
    }
  }
  if (changed.length === 0) return { ok: true }

  // Guard the destructive embedding changes.
  const after = { ...before, ...overrides } as RagConfig
  const embeddingChanged =
    after.embeddingModel !== before.embeddingModel || after.embeddingDim !== before.embeddingDim
  if (embeddingChanged && !options.confirmEmbeddingChange) {
    return {
      error:
        "Changing the embedding model or dimension breaks retrieval for already-embedded documents " +
        "until they are re-embedded. Confirm to proceed.",
      requiresEmbeddingConfirmation: true,
    }
  }

  await prisma.platformSetting.upsert({
    where: { key: KB_CONFIG_SETTING_KEY },
    update: { value: overrides as object },
    create: { key: KB_CONFIG_SETTING_KEY, value: overrides as object },
  })
  await invalidateKbOverrides()
  await writeAdminAudit({
    actor,
    action: "kb.update",
    targetType: "setting",
    targetId: KB_CONFIG_SETTING_KEY,
    metadata: {
      changed: changed.filter((k) => !SECRET_KEYS.includes(k as keyof RagConfig)),
      secretChanged: changed.filter((k) => SECRET_KEYS.includes(k as keyof RagConfig)),
      embeddingChanged,
    },
  })
  return { ok: true }
}
