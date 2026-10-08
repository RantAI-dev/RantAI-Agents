/**
 * The first request after a process start must see the managed providers.
 *
 * The registry is read synchronously and refreshed in the background, so until
 * the first refresh lands it is empty — and an empty registry routes every
 * model id to OpenRouter. Measured on a live deployment: the first chat request
 * after a restart sent a locally served adapter id to OpenRouter and returned
 * 500, while every later request was fine. One failed request per restart, and
 * always the first one someone tries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
const providerRows = vi.fn()
const modelRows = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    llmProvider: { findMany: (...a: unknown[]) => providerRows(...a) },
    llmModel: { findMany: (...a: unknown[]) => modelRows(...a), findUnique: async () => null },
    platformSetting: { findUnique: async () => null },
  },
}))
vi.mock("@/lib/workflow/credentials", () => ({ decryptCredential: () => ({ apiKey: "k" }) }))

beforeEach(() => {
  vi.resetModules()
  providerRows.mockReset()
  modelRows.mockReset()
  providerRows.mockResolvedValue([{ id: "p1", name: "gateway", type: "openai_compatible", baseUrl: "http://gw/v1", encryptedApiKey: "x" }])
  modelRows.mockResolvedValue([{ id: "askv6", providerId: "p1" }])
})

describe("provider registry first load", () => {
  it("is empty on a synchronous read before anything has loaded", async () => {
    // The pre-existing behaviour, pinned so the next test means something.
    const { getProviderRegistry } = await import("@/lib/llm/provider-registry")
    expect(getProviderRegistry().modelProvider.get("askv6")).toBeUndefined()
  })

  it("has the managed provider once ensureProviderRegistryLoaded resolves", async () => {
    const { ensureProviderRegistryLoaded, getProviderRegistry } = await import("@/lib/llm/provider-registry")
    await ensureProviderRegistryLoaded()
    expect(getProviderRegistry().modelProvider.get("askv6")).toBe("p1")
  })

  it("loads once, not on every request", async () => {
    const { ensureProviderRegistryLoaded } = await import("@/lib/llm/provider-registry")
    await ensureProviderRegistryLoaded()
    await ensureProviderRegistryLoaded()
    await ensureProviderRegistryLoaded()
    expect(providerRows).toHaveBeenCalledTimes(1)
  })

  it("does not throw when the database is unreachable", async () => {
    providerRows.mockRejectedValue(new Error("db down"))
    const { ensureProviderRegistryLoaded, getProviderRegistry } = await import("@/lib/llm/provider-registry")
    await expect(ensureProviderRegistryLoaded()).resolves.toBeUndefined()
    expect(getProviderRegistry().providers.size).toBe(0)
  })
})
