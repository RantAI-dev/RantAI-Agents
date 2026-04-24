import { describe, it, expect } from "vitest"
import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { reportExample } from "@/lib/document-ast/examples/report"
import { letterExample } from "@/lib/document-ast/examples/letter"
import { validateDocumentAst } from "@/lib/document-ast/validate"
import { astToDocx } from "@/lib/document-ast/to-docx"
import mammoth from "mammoth"

describe("proposalExample", () => {
  it("validates against the schema and semantic rules", () => {
    const result = validateDocumentAst(proposalExample)
    expect(result.ok).toBe(true)
    if (!result.ok) console.error(result.error)
  })

  it("exercises cover page, TOC, heading, paragraph, list, table", () => {
    expect(proposalExample.coverPage).toBeDefined()
    const types = new Set<string>()
    const walk = (blocks: any[]) => blocks.forEach(b => {
      types.add(b.type)
      if (b.type === "list") b.items.forEach((i: any) => walk(i.children))
      if (b.type === "table") b.rows.forEach((r: any) => r.cells.forEach((c: any) => walk(c.children)))
      if (b.type === "blockquote") walk(b.children)
    })
    walk(proposalExample.body)
    for (const t of ["heading", "paragraph", "table", "list", "toc"]) {
      expect(types.has(t), `missing block type ${t}`).toBe(true)
    }
  })

  it("contains an unsplash: image reference for testing the resolver", () => {
    const walk = (blocks: any[]): boolean => blocks.some(b => {
      if (b.type === "image" && typeof b.src === "string" && b.src.startsWith("unsplash:")) return true
      if (b.type === "list") return b.items.some((i: any) => walk(i.children))
      if (b.type === "table") return b.rows.some((r: any) => r.cells.some((c: any) => walk(c.children)))
      if (b.type === "blockquote") return walk(b.children)
      return false
    })
    expect(walk(proposalExample.body)).toBe(true)
  })

  it("contains at least one footnote and one internal anchor", () => {
    const findInline = (blocks: any[], pred: (inline: any) => boolean): boolean => {
      for (const b of blocks) {
        if (b.children) {
          for (const c of b.children) {
            if (c.type === "paragraph" || c.type === "heading") {
              if (c.children?.some((i: any) => pred(i))) return true
            } else if (pred(c)) {
              return true
            }
          }
        }
        if ((b.type === "paragraph" || b.type === "heading") && b.children.some((i: any) => pred(i))) return true
        if (b.type === "list" && b.items.some((i: any) => findInline(i.children, pred))) return true
        if (b.type === "table" && b.rows.some((r: any) => r.cells.some((c: any) => findInline(c.children, pred)))) return true
      }
      return false
    }
    expect(findInline(proposalExample.body, (i: any) => i.type === "footnote")).toBe(true)
    expect(findInline(proposalExample.body, (i: any) => i.type === "anchor")).toBe(true)
  })
})

describe("reportExample", () => {
  it("validates", () => {
    expect(validateDocumentAst(reportExample).ok).toBe(true)
  })

  it("exports to a non-empty docx buffer", async () => {
    const buf = await astToDocx(reportExample)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
  })

  it("extracted text contains section titles and findings", async () => {
    const buf = await astToDocx(reportExample)
    const text = (await mammoth.extractRawText({ buffer: buf })).value
    expect(text).toMatch(/Findings|Results|Conclusions/i)
  })

  it("exercises features not covered in proposal fixture", () => {
    const types = new Set<string>()
    const walk = (blocks: any[]) => blocks.forEach(b => {
      types.add(b.type)
      if (b.children) b.children.forEach?.((c: any) => {
        if (typeof c === "object" && c.type) types.add(c.type)
      })
      if (b.type === "list") b.items.forEach((i: any) => walk(i.children))
      if (b.type === "table") b.rows.forEach((r: any) => r.cells.forEach((c: any) => walk(c.children)))
      if (b.type === "blockquote") walk(b.children)
    })
    walk(reportExample.body)
    // Report fixture must contain at least: codeBlock, blockquote, horizontalRule, image.
    expect(types.has("codeBlock")).toBe(true)
    expect(types.has("blockquote")).toBe(true)
    expect(types.has("horizontalRule")).toBe(true)
    expect(types.has("image")).toBe(true)
  })
})

describe("letterExample", () => {
  it("validates", () => {
    expect(validateDocumentAst(letterExample).ok).toBe(true)
  })

  it("exports to docx", async () => {
    const buf = await astToDocx(letterExample)
    expect(buf.length).toBeGreaterThan(1500)
  })

  it("has no TOC/list/table blocks (minimal deliverable)", () => {
    const types = new Set<string>()
    const walk = (blocks: any[]) => blocks.forEach(b => {
      types.add(b.type)
      if (b.type === "list") b.items.forEach((i: any) => walk(i.children))
      if (b.type === "table") b.rows.forEach((r: any) => r.cells.forEach((c: any) => walk(c.children)))
    })
    walk(letterExample.body)
    expect(types.has("toc")).toBe(false)
    expect(types.has("list")).toBe(false)
    expect(types.has("table")).toBe(false)
  })
})
