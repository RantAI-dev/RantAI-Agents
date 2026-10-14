import { describe, it, expect } from "vitest"
import { resolveKbFieldProvenance } from "@/features/platform-admin/kb-settings-service"

describe("resolveKbFieldProvenance (TC-988)", () => {
  it("recognizes fallback OPENROUTER_API_KEY as env source for embeddingApiKey", () => {
    const result = resolveKbFieldProvenance("embeddingApiKey", {
      overrides: {},
      env: { OPENROUTER_API_KEY: "sk-or-v1-secret-test" },
    })

    expect(result.source).toBe("env")
    expect(result.set).toBe(true)
    expect(result.secret).toBe(true)
    expect(result.value).toBeUndefined() // never leaks secret
  })

  it("recognizes fallback OPENROUTER_API_KEY as env source for extractVisionApiKey", () => {
    const result = resolveKbFieldProvenance("extractVisionApiKey", {
      overrides: {},
      env: { OPENROUTER_API_KEY: "sk-or-v1-secret-test" },
    })

    expect(result.source).toBe("env")
    expect(result.set).toBe(true)
    expect(result.secret).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it("reports default and not set when neither specific nor fallback env key is present", () => {
    const result = resolveKbFieldProvenance("embeddingApiKey", {
      overrides: {},
      env: {},
    })

    expect(result.source).toBe("default")
    expect(result.set).toBe(false)
    expect(result.secret).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it("prioritizes direct env var KB_EMBEDDING_API_KEY", () => {
    const result = resolveKbFieldProvenance("embeddingApiKey", {
      overrides: {},
      env: {
        KB_EMBEDDING_API_KEY: "specific-kb-key",
        OPENROUTER_API_KEY: "fallback-key",
      },
    })

    expect(result.source).toBe("env")
    expect(result.set).toBe(true)
    expect(result.secret).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it("prioritizes DB override over env", () => {
    const result = resolveKbFieldProvenance("embeddingApiKey", {
      overrides: { embeddingApiKey: "db-override-key" },
      env: { OPENROUTER_API_KEY: "fallback-key" },
    })

    expect(result.source).toBe("db")
    expect(result.set).toBe(true)
    expect(result.secret).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it("prioritizes linked provider for embeddingApiKey and embeddingBaseUrl", () => {
    const keyResult = resolveKbFieldProvenance("embeddingApiKey", {
      overrides: { embeddingApiKey: "db-override-key" },
      embeddingProviderId: "provider-123",
      env: { OPENROUTER_API_KEY: "fallback-key" },
    })
    expect(keyResult.source).toBe("provider")
    expect(keyResult.set).toBe(true)
    expect(keyResult.secret).toBe(true)
    expect(keyResult.value).toBeUndefined()

    const urlResult = resolveKbFieldProvenance("embeddingBaseUrl", {
      overrides: { embeddingBaseUrl: "https://db-override.com" },
      embeddingProviderId: "provider-123",
      effectiveConfig: { embeddingBaseUrl: "https://provider-derived.com" } as any,
    })
    expect(urlResult.source).toBe("provider")
    expect(urlResult.value).toBe("https://provider-derived.com")
  })

  it("resolves non-secret fields with value and provenance", () => {
    const dbResult = resolveKbFieldProvenance("embeddingModel", {
      overrides: { embeddingModel: "text-embedding-3-small" },
    })
    expect(dbResult.source).toBe("db")
    expect(dbResult.value).toBe("text-embedding-3-small")
    expect(dbResult.secret).toBe(false)

    const envResult = resolveKbFieldProvenance("embeddingModel", {
      overrides: {},
      env: { KB_EMBEDDING_MODEL: "bge-m3" },
      envConfig: { embeddingModel: "bge-m3" } as any,
    })
    expect(envResult.source).toBe("env")
    expect(envResult.value).toBe("bge-m3")

    const defResult = resolveKbFieldProvenance("embeddingModel", {
      overrides: {},
      env: {},
      envConfig: { embeddingModel: "amazon/titan-embed-text-v1" } as any,
    })
    expect(defResult.source).toBe("default")
    expect(defResult.value).toBe("amazon/titan-embed-text-v1")
  })
})
