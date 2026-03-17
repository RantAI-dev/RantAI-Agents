import { describe, it, expect } from "vitest"
import { resolveUrl, mcpClientManager } from "@/lib/mcp/client"

// ─── resolveUrl ───────────────────────────────────────────────────────────────

describe("resolveUrl", () => {
  it("replaces a single placeholder with the matching env value", () => {
    const result = resolveUrl("https://api.example.com/{API_KEY}/sse", {
      API_KEY: "secret123",
    })
    expect(result).toBe("https://api.example.com/secret123/sse")
  })

  it("replaces multiple placeholders in a single URL", () => {
    const result = resolveUrl(
      "https://{HOST}:{PORT}/api/{VERSION}",
      { HOST: "example.com", PORT: "8080", VERSION: "v2" }
    )
    expect(result).toBe("https://example.com:8080/api/v2")
  })

  it("keeps the original placeholder when the key is missing from env", () => {
    const result = resolveUrl("https://api.example.com/{MISSING_KEY}/sse", {
      OTHER_KEY: "value",
    })
    expect(result).toBe("https://api.example.com/{MISSING_KEY}/sse")
  })

  it("returns the URL unchanged when there are no placeholders", () => {
    const url = "https://api.example.com/sse"
    const result = resolveUrl(url, { API_KEY: "secret" })
    expect(result).toBe(url)
  })

  it("returns the URL unchanged when env is null", () => {
    const url = "https://api.example.com/{API_KEY}/sse"
    const result = resolveUrl(url, null)
    expect(result).toBe(url)
  })

  it("returns the URL unchanged when env is undefined", () => {
    const url = "https://api.example.com/{API_KEY}/sse"
    const result = resolveUrl(url, undefined)
    expect(result).toBe(url)
  })

  it("does NOT match lowercase key placeholders (stays as {apiKey})", () => {
    const result = resolveUrl("https://api.example.com/{apiKey}/sse", {
      apiKey: "should-not-replace",
    })
    expect(result).toBe("https://api.example.com/{apiKey}/sse")
  })

  it("replaces placeholders with keys containing underscores and digits", () => {
    const result = resolveUrl(
      "https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY_V2}/sse",
      { FIRECRAWL_API_KEY_V2: "fc-abc123" }
    )
    expect(result).toBe("https://mcp.firecrawl.dev/fc-abc123/sse")
  })

  it("returns the URL unchanged when env is an empty object", () => {
    const url = "https://api.example.com/{API_KEY}/sse"
    const result = resolveUrl(url, {})
    expect(result).toBe(url)
  })
})

// ─── McpClientManager singleton ───────────────────────────────────────────────

describe("mcpClientManager", () => {
  it("exports a singleton with required methods", () => {
    expect(mcpClientManager).toBeDefined()
    expect(typeof mcpClientManager.connect).toBe("function")
    expect(typeof mcpClientManager.disconnect).toBe("function")
    expect(typeof mcpClientManager.listTools).toBe("function")
    expect(typeof mcpClientManager.callTool).toBe("function")
    expect(typeof mcpClientManager.disconnectAll).toBe("function")
  })

  it("connect() throws when url is null", async () => {
    await expect(
      mcpClientManager.connect({
        id: "test-server",
        name: "Test Server",
        transport: "sse",
        url: null,
      })
    ).rejects.toThrow("url is required")
  })
})
