import { describe, it, expect } from "vitest"
import { validateDocumentAst } from "@/lib/document-ast/validate"

const baseOk = {
  meta: { title: "T" },
  body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
}

describe("validateDocumentAst", () => {
  it("accepts a valid minimal AST", () => {
    const r = validateDocumentAst(baseOk)
    expect(r.ok).toBe(true)
  })

  it("rejects anchors pointing to non-existent bookmarks", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [
        { type: "paragraph", children: [{ type: "anchor", bookmarkId: "ghost", children: [{ type: "text", text: "x" }] }] },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/bookmark/i)
  })

  it("accepts anchors pointing to existing bookmarks", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [
        { type: "heading", level: 1, bookmarkId: "intro", children: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", children: [{ type: "anchor", bookmarkId: "intro", children: [{ type: "text", text: "see above" }] }] },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it("rejects pageNumber outside header/footer", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "paragraph", children: [{ type: "pageNumber" }] }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/pageNumber/i)
  })

  it("accepts pageNumber inside footer", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      footer: { children: [{ type: "paragraph", children: [
        { type: "text", text: "Page " }, { type: "pageNumber" },
      ] }] },
      body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
    })
    expect(r.ok).toBe(true)
  })

  it("rejects table whose columnWidths don't sum to width", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [
        {
          type: "table",
          width: 9360,
          columnWidths: [3000, 3000],
          rows: [{ cells: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "a" }] }] },
            { children: [{ type: "paragraph", children: [{ type: "text", text: "b" }] }] },
          ] }],
        },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/columnWidths/i)
  })

  it("rejects unsplash image with empty keyword", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "image", src: "unsplash:", alt: "x", width: 100, height: 100 }],
    })
    expect(r.ok).toBe(false)
  })

  it("accepts unsplash image with real keyword", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "image", src: "unsplash:mountain sunset", alt: "hero", width: 800, height: 400 }],
    })
    expect(r.ok).toBe(true)
  })

  it("rejects AST over 128KB", () => {
    const huge = "a".repeat(150_000)
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "paragraph", children: [{ type: "text", text: huge }] }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/size|budget|bytes/i)
  })

  it("rejects AST whose multi-byte UTF-8 content exceeds the byte budget", () => {
    // "🎉" is 4 bytes in UTF-8 but length 2 in JS string (surrogate pair).
    // 40_000 × 4 bytes = 160 KB > 128 KB budget, but length = 80_000 chars only.
    const bigEmoji = "🎉".repeat(40_000)
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "paragraph", children: [{ type: "text", text: bigEmoji }] }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/size|bytes/i)
  })

  it("rejects table whose cell count (with colspan) doesn't match columnWidths", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [
        {
          type: "table",
          width: 9360,
          columnWidths: [3120, 3120, 3120],
          rows: [{ cells: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "only" }] }] },
            { children: [{ type: "paragraph", children: [{ type: "text", text: "two" }] }] },
          ] }],
        },
      ],
    })
    expect(r.ok).toBe(false)
  })
})

describe("validateDocumentAst — mermaid semantic checks", () => {
  const baseMeta = {
    title: "T",
    pageSize: "letter" as const,
    orientation: "portrait" as const,
    font: "Arial",
    fontSize: 12,
    showPageNumbers: false,
  }

  it("accepts a flowchart with a valid diagram-type prefix", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B" }],
    })
    expect(result.ok).toBe(true)
  })

  it("accepts a sequenceDiagram", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "sequenceDiagram\n  A->>B: hi" }],
    })
    expect(result.ok).toBe(true)
  })

  it("rejects whitespace-only code", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "   \n  \t  " }],
    })
    expect(result.ok).toBe(false)
  })

  it("rejects an unknown diagram-type prefix", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "notADiagram\n  A --> B" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/mermaid|diagram type/i)
  })
})
