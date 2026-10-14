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

export interface KbFieldProvenanceOptions {
  overrides?: Record<string, unknown>
  effectiveConfig?: RagConfig
  envConfig?: RagConfig
  embeddingProviderId?: string | null
  env?: Record<string, string | undefined>
}

export interface KbFieldProvenance {
  key: keyof RagConfig
  source: "provider" | "db" | "env" | "default"
  secret: boolean
  value?: unknown
  set?: boolean
}

export function resolveKbFieldProvenance(
  key: keyof RagConfig,
  options: KbFieldProvenanceOptions = {}
): KbFieldProvenance {
  const overrides = options.overrides || {}
  const env = options.env || process.env
  const secret = SECRET_KEYS.includes(key)
  const embeddingProviderId = options.embeddingProviderId

  // While an embedding provider is linked, endpoint + key are derived from
  // it at runtime — surface that instead of the stored/env value.
  const derived =
    !!embeddingProviderId && (key === "embeddingBaseUrl" || key === "embeddingApiKey")

  if (derived) {
    return {
      key,
      source: "provider",
      secret,
      value: secret ? undefined : options.effectiveConfig ? options.effectiveConfig[key] : overrides[key],
      set: secret ? true : undefined,
    }
  }

  // DB override
  const overridden =
    overrides[key] !== undefined && overrides[key] !== null && overrides[key] !== ""
  if (overridden) {
    return {
      key,
      source: "db",
      secret,
      value: secret ? undefined : overrides[key],
      set: secret ? true : undefined,
    }
  }

  // Env vs Default
  const envVarName = ENV_BY_KEY[key]
  const hasDirectEnv = !!(envVarName && env[envVarName])

  if (secret) {
    // Secret keys (embeddingApiKey, extractVisionApiKey) fall back to
    // OPENROUTER_API_KEY at runtime via resolveApiKey in config.ts.
    const hasFallbackEnv = !!env.OPENROUTER_API_KEY
    const isSetInEnv = hasDirectEnv || hasFallbackEnv

    return {
      key,
      source: isSetInEnv ? "env" : "default",
      secret: true,
      value: undefined, // Never leak secrets
      set: isSetInEnv,
    }
  }

  // Non-secret keys
  const effectiveValue =
    options.envConfig?.[key] ?? options.effectiveConfig?.[key] ?? overrides[key]

  return {
    key,
    source: hasDirectEnv ? "env" : "default",
    secret: false,
    value: effectiveValue,
    set: undefined,
  }
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

  const fields = EDITABLE.map((key) =>
    resolveKbFieldProvenance(key, {
      overrides,
      effectiveConfig: effective,
      envConfig: fromEnvOrDefault,
      embeddingProviderId,
    })
  )
  return { fields, embeddingProviderId, effective: redactSecrets(effective) }
}

function redactSecrets(
  config: RagConfig,
  env: Record<string, string | undefined> = process.env
): Omit<RagConfig, "embeddingApiKey" | "extractVisionApiKey"> & {
  embeddingApiKeySet: boolean
  extractVisionApiKeySet: boolean
} {
  const { embeddingApiKey, extractVisionApiKey, ...rest } = config
  const openRouterKey = env.OPENROUTER_API_KEY || ""
  return {
    ...rest,
    embeddingApiKeySet: !!(embeddingApiKey || openRouterKey),
    extractVisionApiKeySet: !!(extractVisionApiKey || openRouterKey),
  }
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
