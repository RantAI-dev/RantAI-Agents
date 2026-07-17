import "server-only"
import { prisma } from "@/lib/prisma"
import { decryptCredential } from "@/lib/workflow/credentials"

/**
 * In-memory view of admin-managed LLM providers (LlmProvider table) and which
 * model ids they serve. getChatProvider() is sync and hot, so this cache is
 * consulted synchronously; refreshes happen in the background when the snapshot
 * goes stale (TTL) and immediately when the admin APIs write (invalidate).
 *
 * With zero LlmProvider rows the snapshot stays empty and callers fall back to
 * the existing env-driven wiring — existing deploys work with no migration.
 */

export interface ManagedProvider {
  id: string
  name: string
  type: "openrouter" | "openai_compatible"
  baseUrl: string | null
  /** Decrypted API key, or null when none stored / decryption failed. */
  apiKey: string | null
}

interface RegistrySnapshot {
  providers: Map<string, ManagedProvider>
  /** model id → provider id, for enabled managed models only. */
  modelProvider: Map<string, string>
  /** First enabled openrouter-type provider (its key overrides the env key). */
  openrouter: ManagedProvider | null
  /** PlatformSetting["default_chat_model"], if the admin set one. */
  defaultModel: string | null
}

const TTL_MS = 60_000

const EMPTY: RegistrySnapshot = {
  providers: new Map(),
  modelProvider: new Map(),
  openrouter: null,
  defaultModel: null,
}

let snapshot: RegistrySnapshot = EMPTY
let loadedAt = 0
let refreshing: Promise<void> | null = null

function decryptKey(encrypted: string | null, providerName: string): string | null {
  if (!encrypted) return null
  try {
    const data = decryptCredential(encrypted)
    return typeof data.apiKey === "string" ? data.apiKey : null
  } catch (err) {
    console.warn(
      `[provider-registry] failed to decrypt API key for provider "${providerName}" ` +
        `(CREDENTIAL_ENCRYPTION_KEY changed?): ${err instanceof Error ? err.message : err}`
    )
    return null
  }
}

export async function refreshProviderRegistry(): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const rows = await prisma.llmProvider.findMany({ where: { enabled: true } })
      const providers = new Map<string, ManagedProvider>()
      let openrouter: ManagedProvider | null = null
      for (const row of rows) {
        const p: ManagedProvider = {
          id: row.id,
          name: row.name,
          type: row.type === "openrouter" ? "openrouter" : "openai_compatible",
          baseUrl: row.baseUrl,
          apiKey: decryptKey(row.encryptedApiKey, row.name),
        }
        providers.set(p.id, p)
        if (p.type === "openrouter" && !openrouter) openrouter = p
      }

      const settingRow = await prisma.platformSetting
        .findUnique({ where: { key: "default_chat_model" } })
        .catch(() => null)
      let defaultModel =
        settingRow && typeof settingRow.value === "string" && settingRow.value
          ? settingRow.value
          : null
      // If the chosen default has since been removed or disabled (e.g. its
      // provider was deleted), fall back to the code default instead of
      // routing traffic at a dead model id.
      if (defaultModel) {
        const row = await prisma.llmModel.findUnique({
          where: { id: defaultModel },
          select: { enabled: true, isActive: true },
        })
        if (!row || !row.enabled || !row.isActive) defaultModel = null
      }

      const modelProvider = new Map<string, string>()
      if (providers.size > 0) {
        const models = await prisma.llmModel.findMany({
          where: { providerId: { in: [...providers.keys()] }, enabled: true },
          select: { id: true, providerId: true },
        })
        for (const m of models) {
          if (m.providerId) modelProvider.set(m.id, m.providerId)
        }
      }

      snapshot = { providers, modelProvider, openrouter, defaultModel }
      loadedAt = Date.now()
    } catch (err) {
      // DB unreachable or migration not applied yet — keep the last snapshot
      // (or EMPTY, i.e. env fallback) and try again next TTL.
      loadedAt = Date.now()
      console.warn(
        `[provider-registry] refresh failed (falling back to env wiring): ${err instanceof Error ? err.message : err}`
      )
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/**
 * Current snapshot, kicking off a background refresh when stale. May be one
 * TTL behind after admin edits from another process; same-process writes call
 * invalidateProviderRegistry() for immediacy.
 */
export function getProviderRegistry(): RegistrySnapshot {
  if (Date.now() - loadedAt > TTL_MS) {
    void refreshProviderRegistry()
  }
  return snapshot
}

/**
 * Platform default chat model, sync from the cached snapshot: the admin-set
 * PlatformSetting["default_chat_model"] when present, else the code default
 * passed in by the caller (avoids importing @/lib/models here).
 */
export function getPlatformDefaultModel(fallback: string): string {
  return getProviderRegistry().defaultModel ?? fallback
}

/** Reload now — call after any LlmProvider / managed-model write. */
export async function invalidateProviderRegistry(): Promise<void> {
  loadedAt = 0
  await refreshProviderRegistry()
}
