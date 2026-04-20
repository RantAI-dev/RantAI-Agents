import { describe, expect, it } from "vitest"
import { parseDocumentFrontmatter } from "./frontmatter"

describe("parseDocumentFrontmatter", () => {
  it("auto-wraps content without a frontmatter block as implicit plain", () => {
    const content = "# Just a title\n\nBody paragraph."
    const result = parseDocumentFrontmatter(content)
    expect(result.template).toBe("plain")
    expect(result.metadata).toEqual({})
    expect(result.body).toBe(content)
    expect(result.implicit).toBe(true)
    expect(result.parseError).toBeUndefined()
  })

  it("recognizes an empty frontmatter block as explicit but treats template as plain", () => {
    const content = "---\n---\n# Body"
    const result = parseDocumentFrontmatter(content)
    expect(result.template).toBe("plain")
    expect(result.metadata).toEqual({})
    expect(result.body).toBe("# Body")
    expect(result.implicit).toBe(false)
    expect(result.parseError).toBeUndefined()
  })

  it("splits letter-template frontmatter from body correctly", () => {
    const content = `---
template: letter
company_name: Acme Corp
recipient_name: Jane Doe
date: 2026-04-20
subject: Quarterly update
signatory_name: John Smith
signatory_position: CEO
---
Dear Jane,

Quarterly update body goes here.
`
    const result = parseDocumentFrontmatter(content)
    expect(result.template).toBe("letter")
    expect(result.metadata.company_name).toBe("Acme Corp")
    expect(result.metadata.recipient_name).toBe("Jane Doe")
    expect(result.metadata.subject).toBe("Quarterly update")
    expect(result.body).toContain("Dear Jane")
    expect(result.body).not.toContain("company_name")
    expect(result.implicit).toBe(false)
    expect(result.parseError).toBeUndefined()
  })

  it("surfaces malformed YAML via parseError and falls back to plain template", () => {
    // Indentation error — an inline array opened without closing bracket.
    const content = `---
template: letter
bad: [unclosed
recipient_name: Jane
---
Body here.
`
    const result = parseDocumentFrontmatter(content)
    expect(result.parseError).toBeTruthy()
    expect(result.parseError).toMatch(/Line \d+:/i) // user-friendly line prefix
    expect(result.template).toBe("plain")
    // Body keeps the whole original content so user can still see their source
    expect(result.body).toBe(content)
    expect(result.implicit).toBe(false)
  })

  it("handles nested YAML shapes (arrays, objects) in metadata", () => {
    const content = `---
template: report
title: Q1 Report
authors:
  - Alice
  - Bob
metrics:
  revenue: 1000000
  users: 50
---
Report body.
`
    const result = parseDocumentFrontmatter(content)
    expect(result.template).toBe("report")
    expect(result.metadata.authors).toEqual(["Alice", "Bob"])
    expect(result.metadata.metrics).toEqual({ revenue: 1000000, users: 50 })
    expect(result.body).toContain("Report body")
  })

  it("treats non-string template key as plain (defensive)", () => {
    const content = `---
template: 42
title: Odd case
---
Body.
`
    const result = parseDocumentFrontmatter(content)
    expect(result.template).toBe("plain")
    expect(result.metadata.title).toBe("Odd case")
  })

  it("trims whitespace in template name", () => {
    const content = `---
template: "  memo  "
from: Alice
---
Body.
`
    const result = parseDocumentFrontmatter(content)
    expect(result.template).toBe("memo")
  })

  it("does not match --- lines that aren't at the very start of the document", () => {
    // Three dashes later in the body should NOT be picked up as frontmatter.
    const content = "# Title\n\nSome text.\n\n---\n\ntemplate: letter\n"
    const result = parseDocumentFrontmatter(content)
    expect(result.implicit).toBe(true)
    expect(result.template).toBe("plain")
    expect(result.body).toBe(content)
  })
})
