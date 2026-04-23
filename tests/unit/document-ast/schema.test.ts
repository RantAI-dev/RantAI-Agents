import { describe, it, expect } from "vitest"
import { DocumentAstSchema } from "@/lib/document-ast/schema"

describe("DocumentAstSchema", () => {
  it("accepts the minimal valid document", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi" },
      body: [
        { type: "paragraph", children: [{ type: "text", text: "Hello" }] },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty body", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi" },
      body: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects paragraph with no children", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi" },
      body: [{ type: "paragraph", children: [] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects bad ISO date", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi", date: "2026/04/23" },
      body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
    })
    expect(result.success).toBe(false)
  })

  it("populates defaults on minimal input", () => {
    const r = DocumentAstSchema.safeParse({
      meta: { title: "Hi" },
      body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.meta.pageSize).toBe("letter")
      expect(r.data.meta.orientation).toBe("portrait")
      expect(r.data.meta.font).toBe("Arial")
      expect(r.data.meta.fontSize).toBe(12)
      expect(r.data.meta.showPageNumbers).toBe(false)
    }
  })

  it("validates deeply-nested footnote → paragraph → link → text", () => {
    const r = DocumentAstSchema.safeParse({
      meta: { title: "T" },
      body: [{
        type: "paragraph",
        children: [
          { type: "text", text: "Claim" },
          { type: "footnote", children: [
            { type: "paragraph", children: [
              { type: "link", href: "https://example.com", children: [{ type: "text", text: "src" }] },
            ] },
          ] },
        ],
      }],
    })
    expect(r.success).toBe(true)
  })

  it("accepts a nested heading + list + table", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "T" },
      body: [
        { type: "heading", level: 1, children: [{ type: "text", text: "H1" }] },
        {
          type: "list",
          ordered: false,
          items: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "a" }] }] },
          ],
        },
        {
          type: "table",
          width: 9360,
          columnWidths: [4680, 4680],
          rows: [
            {
              isHeader: true,
              cells: [
                { children: [{ type: "paragraph", children: [{ type: "text", text: "A" }] }] },
                { children: [{ type: "paragraph", children: [{ type: "text", text: "B" }] }] },
              ],
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})
