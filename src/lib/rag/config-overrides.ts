import { prisma } from "@/lib/prisma"
import { decryptCredential } from "@/lib/workflow/credentials"
import type { RagConfig } from "./config"

/**
 * Admin-set KB config stored in PlatformSetting["kb_config"]. getRagConfig()
 * is sync and called per-request, so overrides live in an in-memory cache with
 * a stale-triggered background refresh; admin writes call
 * invalidateKbOverrides() for immediate effect in-process.
 *
 * Field precedence per key: DB override > env > built-in default. Missing row
 * (fresh/never-configured deploys) → empty overrides, pure env behavior.
 */

export const KB_CONFIG_SETTING_KEY = "kb_config"

const TTL_MS = 60_000

let overrides: Partial<RagConfig> = {}
let loadedAt = 0
let refreshing: Promise<void> | null = null

/** Keys an admin may override (whitelist — anything else in the row is ignored). */
const OVERRIDABLE: (keyof RagConfig)[] = [
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

function sanitize(value: unknown): Partial<RagConfig> {
  if (!value || typeof value !== "object") return {}
  const raw = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of OVERRIDABLE) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
      out[key] = raw[key]
    }
  }
  return out as Partial<RagConfig>
}

export async function refreshKbOverrides(): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const row = await prisma.platformSetting.findUnique({
        where: { key: KB_CONFIG_SETTING_KEY },
      })
      const next = row ? sanitize(row.value) : {}
      // "Use a managed provider" mode: kb_config.embeddingProviderId points at
      // an LlmProvider row; endpoint + key are derived from it here so the
      // admin configures the server once (provider) instead of re-pasting
      // URL/key. Explicit manual embeddingBaseUrl/ApiKey overrides never mix
      // in — the provider wins while set.
      const raw = row?.value as Record<string, unknown> | undefined
      const providerId = raw && typeof raw.embeddingProviderId === "string" ? raw.embeddingProviderId : null
      if (providerId) {
        const provider = await prisma.llmProvider.findUnique({ where: { id: providerId } })
        if (provider?.enabled) {
          const base = (provider.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "")
          next.embeddingBaseUrl = `${base}/embeddings`
          if (provider.encryptedApiKey) {
            try {
              const key = decryptCredential(provider.encryptedApiKey).apiKey
              if (typeof key === "string") next.embeddingApiKey = key
            } catch (err) {
              console.warn(
                `[kb-config] could not decrypt embedding provider key: ${err instanceof Error ? err.message : err}`
              )
            }
          }
        } else {
          console.warn(
            `[kb-config] embeddingProviderId "${providerId}" missing or disabled — falling back to manual/env embedding config`
          )
        }
      }
      overrides = next
      loadedAt = Date.now()
    } catch (err) {
      // DB unreachable / migration missing — keep last value, retry next TTL.
      loadedAt = Date.now()
      console.warn(
        `[kb-config] override refresh failed (using env): ${err instanceof Error ? err.message : err}`
      )
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export function getKbOverrides(): Partial<RagConfig> {
  if (Date.now() - loadedAt > TTL_MS) {
    void refreshKbOverrides()
  }
  return overrides
}

/** Reload now — call after the admin KB settings API writes. */
export async function invalidateKbOverrides(): Promise<void> {
  loadedAt = 0
  await refreshKbOverrides()
}
