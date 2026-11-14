import { describe, expect, it } from "vitest"
import {
  capabilityWarning,
  createKeyBody,
  expiresToApi,
  expiresToInput,
  formFromKey,
  parseAddressList,
  updateKeyBody,
  type AgentApiKey,
} from "./key-types"

const key: AgentApiKey = {
  id: "k1",
  name: "Classroom",
  key: "rantai_sk_9tR2…Xq4A",
  assistantId: "a1",
  scopes: ["chat"],
  ipWhitelist: ["203.0.113.9", "10.0.0.0/8"],
  requestCount: 12,
  lastUsedAt: null,
  enabled: true,
  expiresAt: "2026-12-31T23:59:59.000Z",
  createdAt: "2026-11-14T08:00:00.000Z",
  updatedAt: "2026-11-14T08:00:00.000Z",
  assistant: { id: "a1", name: "Budi Helper", emoji: "🤖" },
}

describe("the agent API key form", () => {
  it("reads a key back into the form without losing its scopes or allowlist", () => {
    const form = formFromKey(key)
    expect(form.scopes).toEqual(["chat"])
    expect(form.ipWhitelist).toBe("203.0.113.9, 10.0.0.0/8")
    expect(expiresToApi(form.expiresAt)).toBe(key.expiresAt)
  })

  it("treats an empty scope list as both scopes, which is what the API does", () => {
    expect(formFromKey({ ...key, scopes: [] }).scopes).toEqual(["chat", "chat:stream"])
  })

  it("splits the allowlist on commas and whitespace, dropping blanks", () => {
    expect(parseAddressList(" 203.0.113.9,10.0.0.0/8\n  192.0.2.1 ")).toEqual([
      "203.0.113.9",
      "10.0.0.0/8",
      "192.0.2.1",
    ])
    expect(parseAddressList("   ")).toEqual([])
  })

  it("sends a create body with the mask nowhere in it", () => {
    const body = createKeyBody({ ...formFromKey(key), name: "  Support widget  " })
    expect(body).toMatchObject({
      name: "Support widget",
      assistantId: "a1",
      scopes: ["chat"],
      ipWhitelist: ["203.0.113.9", "10.0.0.0/8"],
    })
    expect(body.expiresAt).toBe("2026-12-31T23:59:59.000Z")
  })

  it("leaves the expiry out of a create that never expires, and nulls it on an edit", () => {
    const never = { ...formFromKey(key), expiresAt: "" }
    expect("expiresAt" in createKeyBody(never)).toBe(false)
    expect(updateKeyBody(never).expiresAt).toBeNull()
  })

  it("round-trips an instant through the control's local value", () => {
    const input = expiresToInput("2026-12-31T23:59:59.000Z")
    expect(expiresToApi(input)).toBe("2026-12-31T23:59:59.000Z")
    expect(expiresToInput(null)).toBe("")
    expect(expiresToApi("")).toBeNull()
  })

  it("warns about every binding the capability gate refuses", () => {
    expect(capabilityWarning([])).toBeNull()
    expect(capabilityWarning(["the knowledge base"])).toMatch(/409 capability_not_ported/)
    expect(capabilityWarning(["an MCP server", "a workflow"])).toMatch(
      /bound to an MCP server and a workflow/,
    )
  })
})
