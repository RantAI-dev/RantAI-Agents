import { describe, it, expect } from "vitest"
import {
  validateDomain,
  extractOrigin,
  isLocalhost,
} from "@/lib/embed/domain-validator"

// ─── validateDomain ──────────────────────────────────────────────────────────

describe("validateDomain", () => {
  it("allows all when allowedDomains is empty", () => {
    const result = validateDomain("https://anything.com", [])
    expect(result).toEqual({ valid: true, domain: null })
  })

  it("allows all when allowedDomains is undefined-ish", () => {
    const result = validateDomain("https://anything.com", [] as string[])
    expect(result).toEqual({ valid: true, domain: null })
  })

  it("rejects when origin is null", () => {
    const result = validateDomain(null, ["example.com"])
    expect(result).toEqual({ valid: false, domain: null })
  })

  it("rejects when origin is empty string", () => {
    const result = validateDomain("", ["example.com"])
    expect(result).toEqual({ valid: false, domain: null })
  })

  it("matches exact domain from URL origin", () => {
    const result = validateDomain("https://example.com", ["example.com"])
    expect(result.valid).toBe(true)
    expect(result.domain).toBe("example.com")
  })

  it("matches case-insensitively", () => {
    const result = validateDomain("https://Example.COM", ["example.com"])
    expect(result.valid).toBe(true)
  })

  it("trims whitespace in allowed domains", () => {
    const result = validateDomain("https://example.com", ["  example.com  "])
    expect(result.valid).toBe(true)
  })

  it("matches wildcard subdomain *.example.com", () => {
    const result = validateDomain("https://app.example.com", ["*.example.com"])
    expect(result.valid).toBe(true)
    expect(result.domain).toBe("app.example.com")
  })

  it("wildcard matches the base domain itself", () => {
    const result = validateDomain("https://example.com", ["*.example.com"])
    expect(result.valid).toBe(true)
  })

  it("wildcard matches deeply nested subdomains", () => {
    const result = validateDomain("https://a.b.c.example.com", ["*.example.com"])
    expect(result.valid).toBe(true)
  })

  it("rejects non-matching domain", () => {
    const result = validateDomain("https://evil.com", ["example.com"])
    expect(result.valid).toBe(false)
    expect(result.domain).toBe("evil.com")
  })

  it("rejects non-matching wildcard", () => {
    const result = validateDomain("https://evil.com", ["*.example.com"])
    expect(result.valid).toBe(false)
  })

  it("treats raw hostname (non-URL) as hostname directly", () => {
    const result = validateDomain("example.com", ["example.com"])
    expect(result.valid).toBe(true)
  })

  it("checks multiple allowed domains", () => {
    const allowed = ["foo.com", "bar.com", "*.baz.com"]
    expect(validateDomain("https://bar.com", allowed).valid).toBe(true)
    expect(validateDomain("https://sub.baz.com", allowed).valid).toBe(true)
    expect(validateDomain("https://other.com", allowed).valid).toBe(false)
  })
})

// ─── extractOrigin ───────────────────────────────────────────────────────────

describe("extractOrigin", () => {
  it("returns Origin header when present", () => {
    const headers = new Headers({ Origin: "https://example.com" })
    expect(extractOrigin(headers)).toBe("https://example.com")
  })

  it("ignores Origin if it is 'null' string", () => {
    const headers = new Headers({ Origin: "null" })
    expect(extractOrigin(headers)).toBe(null)
  })

  it("falls back to Referer when Origin is missing", () => {
    const headers = new Headers({ Referer: "https://example.com/page?q=1" })
    expect(extractOrigin(headers)).toBe("https://example.com")
  })

  it("returns null when both Origin and Referer are missing", () => {
    const headers = new Headers()
    expect(extractOrigin(headers)).toBe(null)
  })

  it("returns null when Referer is not a valid URL", () => {
    const headers = new Headers({ Referer: "not-a-url" })
    expect(extractOrigin(headers)).toBe(null)
  })
})

// ─── isLocalhost ─────────────────────────────────────────────────────────────

describe("isLocalhost", () => {
  it("returns true for http://localhost", () => {
    expect(isLocalhost("http://localhost")).toBe(true)
  })

  it("returns true for http://localhost:3000", () => {
    expect(isLocalhost("http://localhost:3000")).toBe(true)
  })

  it("returns true for http://127.0.0.1", () => {
    expect(isLocalhost("http://127.0.0.1")).toBe(true)
  })

  it("returns true for http://0.0.0.0:8080", () => {
    expect(isLocalhost("http://0.0.0.0:8080")).toBe(true)
  })

  it("returns true for .local domains", () => {
    expect(isLocalhost("http://myapp.local")).toBe(true)
  })

  it("returns false for external domains", () => {
    expect(isLocalhost("https://example.com")).toBe(false)
  })

  it("returns false for null", () => {
    expect(isLocalhost(null)).toBe(false)
  })

  it("returns false for invalid URL", () => {
    expect(isLocalhost("not-a-url")).toBe(false)
  })
})
