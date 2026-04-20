import { describe, expect, it } from "vitest"
import { validateDocumentFrontmatter } from "./validate"

const validLetter = {
  template: "letter",
  company_name: "Acme Corp",
  company_address: "123 Main St",
  recipient_name: "Jane Doe",
  date: "2026-04-20",
  subject: "Quarterly update",
  signatory_name: "John Smith",
  signatory_position: "CEO",
}

const validReport = {
  template: "report",
  title: "Q1 Report",
  author: "Alice",
  date: "2026-04-20",
}

const validMemo = {
  template: "memo",
  from: "Alice",
  to: "Engineering Team",
  date: "2026-04-20",
  subject: "Sprint retro",
}

describe("validateDocumentFrontmatter — plain", () => {
  it("accepts empty metadata", () => {
    const r = validateDocumentFrontmatter("plain", {})
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    expect(r.template.name).toBe("plain")
  })

  it("passes through unknown keys (permissive schema)", () => {
    const r = validateDocumentFrontmatter("plain", {
      author: "Alice",
      random_field: 42,
    })
    expect(r.ok).toBe(true)
    expect(r.data.author).toBe("Alice")
    expect(r.data.random_field).toBe(42)
  })
})

describe("validateDocumentFrontmatter — letter", () => {
  it("accepts a fully-specified letter", () => {
    const r = validateDocumentFrontmatter("letter", validLetter)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.template.name).toBe("letter")
  })

  it("accepts optional fields", () => {
    const r = validateDocumentFrontmatter("letter", {
      ...validLetter,
      company_logo: "https://example.com/logo.png",
      reference_number: "REF-001",
    })
    expect(r.ok).toBe(true)
  })

  it("rejects when required field is missing", () => {
    const { recipient_name, ...incomplete } = validLetter
    void recipient_name
    const r = validateDocumentFrontmatter("letter", incomplete)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes("recipient_name"))).toBe(true)
  })

  it("reports every missing required field, not just the first", () => {
    const r = validateDocumentFrontmatter("letter", { template: "letter" })
    expect(r.ok).toBe(false)
    // 7 required fields beyond `template`: company_name, company_address,
    // recipient_name, date, subject, signatory_name, signatory_position
    expect(r.errors.length).toBeGreaterThanOrEqual(7)
  })

  it("preserves the original metadata in data on failure (not parsed output)", () => {
    const r = validateDocumentFrontmatter("letter", { template: "letter" })
    expect(r.ok).toBe(false)
    expect(r.data).toEqual({ template: "letter" })
  })
})

describe("validateDocumentFrontmatter — report", () => {
  it("accepts a minimal report", () => {
    const r = validateDocumentFrontmatter("report", validReport)
    expect(r.ok).toBe(true)
    expect(r.template.name).toBe("report")
  })

  it("rejects missing title", () => {
    const { title, ...incomplete } = validReport
    void title
    const r = validateDocumentFrontmatter("report", incomplete)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes("title"))).toBe(true)
  })
})

describe("validateDocumentFrontmatter — memo", () => {
  it("accepts a minimal memo", () => {
    const r = validateDocumentFrontmatter("memo", validMemo)
    expect(r.ok).toBe(true)
    expect(r.template.name).toBe("memo")
  })

  it("rejects missing from/to", () => {
    const r = validateDocumentFrontmatter("memo", {
      template: "memo",
      date: "2026-04-20",
      subject: "Test",
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes("from"))).toBe(true)
    expect(r.errors.some((e) => e.includes("to"))).toBe(true)
  })
})

describe("validateDocumentFrontmatter — unknown template", () => {
  it("falls back to plain and emits a warning", () => {
    const r = validateDocumentFrontmatter("nonexistent_template", {
      title: "Something",
    })
    expect(r.template.name).toBe("plain")
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings[0]).toContain("Unknown template")
    expect(r.warnings[0]).toContain("nonexistent_template")
  })

  it("does not fail validation when unknown template has arbitrary metadata", () => {
    // Plain's schema is permissive, so unknown fields pass through.
    const r = validateDocumentFrontmatter("nonexistent_template", {
      foo: "bar",
    })
    expect(r.ok).toBe(true)
  })
})

describe("validateDocumentFrontmatter — error message shape", () => {
  it("formats errors as `path: reason`", () => {
    const r = validateDocumentFrontmatter("letter", { template: "letter" })
    for (const err of r.errors) {
      expect(err).toMatch(/^[a-z_]+:\s.+/)
    }
  })
})
