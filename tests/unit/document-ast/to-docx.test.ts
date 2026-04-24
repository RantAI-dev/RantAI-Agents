import { describe, it, expect } from "vitest"
import { astToDocx } from "@/lib/document-ast/to-docx"
import type { DocumentAst } from "@/lib/document-ast/schema"
import mammoth from "mammoth"

async function extractText(buf: Buffer): Promise<string> {
  const res = await mammoth.extractRawText({ buffer: buf })
  return res.value
}

async function extractHtml(buf: Buffer): Promise<string> {
  const res = await mammoth.convertToHtml({ buffer: buf })
  return res.value
}

const minimalAst: DocumentAst = {
  meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
  body: [{ type: "paragraph", children: [{ type: "text", text: "Hello world" }] }],
}

describe("astToDocx", () => {
  it("produces a non-empty Buffer for a minimal AST", async () => {
    const buf = await astToDocx(minimalAst)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it("buffer starts with ZIP magic bytes (PK)", async () => {
    const buf = await astToDocx(minimalAst)
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4b) // 'K'
  })
})

describe("astToDocx — inline nodes", () => {
  it("renders bold, italic, and plain text", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [
        { type: "text", text: "normal " },
        { type: "text", text: "bold", bold: true },
        { type: "text", text: " " },
        { type: "text", text: "italic", italic: true },
      ] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("normal bold italic")
  })

  it("renders an external hyperlink", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [
        { type: "text", text: "See " },
        { type: "link", href: "https://example.com", children: [{ type: "text", text: "example" }] },
      ] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("example")
  })

  it("renders a line break between two runs", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [
        { type: "text", text: "line one" },
        { type: "lineBreak" },
        { type: "text", text: "line two" },
      ] }],
    })
    const text = await extractText(buf)
    expect(text).toMatch(/line one[\s\S]*line two/)
  })

  it("renders an internal anchor inline", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "heading", level: 1, bookmarkId: "top", children: [{ type: "text", text: "Top" }] },
        { type: "paragraph", children: [
          { type: "anchor", bookmarkId: "top", children: [{ type: "text", text: "jump up" }] },
        ] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("jump up")
  })

  it("renders a tab inline", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [
        { type: "text", text: "left" },
        { type: "tab" },
        { type: "text", text: "right" },
      ] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("left")
    expect(text).toContain("right")
  })
})

describe("astToDocx — blocks part 1", () => {
  it("renders H1 and body paragraph with distinct styles", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "heading", level: 1, children: [{ type: "text", text: "Chapter One" }] },
        { type: "paragraph", children: [{ type: "text", text: "Intro paragraph." }] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Chapter One")
    expect(text).toContain("Intro paragraph.")
  })

  it("renders a blockquote with attribution", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "blockquote",
          attribution: "Alice",
          children: [{ type: "paragraph", children: [{ type: "text", text: "Be excellent." }] }] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Be excellent.")
    expect(text).toContain("Alice")
  })

  it("renders a codeBlock", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "codeBlock", language: "ts", code: "const x = 1\nconst y = 2" },
      ],
    })
    const text = await extractText(buf)
    expect(text).toMatch(/const x = 1[\s\S]*const y = 2/)
  })

  it("renders a paragraph with alignment and indent", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "paragraph",
          align: "center",
          indent: { left: 720, firstLine: 360 },
          children: [{ type: "text", text: "centered with indent" }] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("centered with indent")
  })

  it("renders a horizontal rule", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "paragraph", children: [{ type: "text", text: "before" }] },
        { type: "horizontalRule" },
        { type: "paragraph", children: [{ type: "text", text: "after" }] },
      ],
    })
    expect(buf.length).toBeGreaterThan(1000)
    const text = await extractText(buf)
    expect(text).toContain("before")
    expect(text).toContain("after")
  })
})

describe("astToDocx — lists", () => {
  it("renders an unordered list with nested ordered sub-list", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        {
          type: "list", ordered: false, items: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "alpha" }] }] },
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "bravo" }] }],
              subList: { ordered: true, items: [
                { children: [{ type: "paragraph", children: [{ type: "text", text: "bravo.1" }] }] },
                { children: [{ type: "paragraph", children: [{ type: "text", text: "bravo.2" }] }] },
              ] },
            },
          ],
        },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("alpha")
    expect(text).toContain("bravo")
    expect(text).toContain("bravo.1")
    expect(text).toContain("bravo.2")
  })

  it("renders an ordered list with startAt", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "list", ordered: true, startAt: 5, items: [
          { children: [{ type: "paragraph", children: [{ type: "text", text: "fifth" }] }] },
          { children: [{ type: "paragraph", children: [{ type: "text", text: "sixth" }] }] },
        ] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("fifth")
    expect(text).toContain("sixth")
  })
})

describe("astToDocx — images", () => {
  it("embeds a placeholder when the remote fetch fails", async () => {
    // src points to a host that doesn't resolve so fetch fails; fallback fires.
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "image", src: "https://this-host-does-not-exist.invalid/x.png",
          alt: "ghost", width: 200, height: 150, caption: "figure 1" },
      ],
    })
    expect(buf.length).toBeGreaterThan(1000)
    const text = await extractText(buf)
    expect(text).toContain("figure 1")
  })
})

describe("astToDocx — page flow", () => {
  it("emits a page break block", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "paragraph", children: [{ type: "text", text: "before" }] },
        { type: "pageBreak" },
        { type: "paragraph", children: [{ type: "text", text: "after" }] },
      ],
    })
    expect(buf.length).toBeGreaterThan(1000)
    const text = await extractText(buf)
    expect(text).toContain("before")
    expect(text).toContain("after")
  })

  it("renders a TOC with a title and heading with bookmark", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "toc", maxLevel: 2, title: "Contents" },
        { type: "heading", level: 1, bookmarkId: "intro", children: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", children: [
          { type: "anchor", bookmarkId: "intro", children: [{ type: "text", text: "jump" }] },
        ] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Contents")
    expect(text).toContain("Intro")
    expect(text).toContain("jump")
  })
})

describe("astToDocx — header/footer", () => {
  it("renders a header and a footer with page number", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: true },
      header: { children: [{ type: "paragraph", children: [{ type: "text", text: "Confidential" }] }] },
      footer: { children: [{ type: "paragraph", children: [
        { type: "text", text: "Page " }, { type: "pageNumber" },
      ] }] },
      body: [{ type: "paragraph", children: [{ type: "text", text: "body" }] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("body")
    // mammoth raw-text may not include header/footer strings, so validate size only
    expect(buf.length).toBeGreaterThan(1500)
  })

  it("renders body-only document when no header/footer set", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [{ type: "text", text: "solo" }] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("solo")
  })
})

describe("astToDocx — footnotes", () => {
  it("collects an inline footnote and emits it at doc level", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "paragraph", children: [
          { type: "text", text: "Claim" },
          { type: "footnote", children: [{ type: "paragraph", children: [{ type: "text", text: "See p.42" }] }] },
          { type: "text", text: " substantiated." },
        ] },
      ],
    })
    // mammoth convertToHtml surfaces footnote body text in an <ol> after the body
    const html = await extractHtml(buf)
    expect(html).toContain("Claim")
    expect(html).toContain("substantiated")
    expect(html).toContain("See p.42")
  })

  it("handles multiple footnotes with correct numbering", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "paragraph", children: [
          { type: "text", text: "First" },
          { type: "footnote", children: [{ type: "paragraph", children: [{ type: "text", text: "note-alpha" }] }] },
          { type: "text", text: " and second" },
          { type: "footnote", children: [{ type: "paragraph", children: [{ type: "text", text: "note-beta" }] }] },
          { type: "text", text: " claims." },
        ] },
      ],
    })
    const html = await extractHtml(buf)
    expect(html).toContain("note-alpha")
    expect(html).toContain("note-beta")
  })
})

describe("astToDocx — cover page", () => {
  it("renders cover page above body with a page break between", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      coverPage: {
        title: "Infrastructure Migration Proposal",
        subtitle: "NQRust-HV Platform Transition",
        author: "NQ Technology",
        date: "2026-04-23",
        organization: "NQ Technology Indonesia",
      },
      body: [{ type: "paragraph", children: [{ type: "text", text: "Executive Summary" }] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("Infrastructure Migration Proposal")
    expect(text).toContain("NQ Technology")
    expect(text).toContain("2026-04-23")
    expect(text).toContain("Executive Summary")
  })

  it("renders body only when coverPage is absent", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [{ type: "text", text: "solo" }] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("solo")
    expect(text).not.toContain("Infrastructure Migration Proposal")
  })
})

describe("astToDocx — tables", () => {
  it("renders a 2-column table with header row + data", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        {
          type: "table", width: 9360, columnWidths: [4680, 4680],
          rows: [
            { isHeader: true, cells: [
              { children: [{ type: "paragraph", children: [{ type: "text", text: "Feature" }] }], shading: "D5E8F0" },
              { children: [{ type: "paragraph", children: [{ type: "text", text: "Value" }] }], shading: "D5E8F0" },
            ] },
            { cells: [
              { children: [{ type: "paragraph", children: [{ type: "text", text: "Price" }] }] },
              { children: [{ type: "paragraph", children: [{ type: "text", text: "$100" }] }] },
            ] },
          ],
        },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Feature")
    expect(text).toContain("Value")
    expect(text).toContain("Price")
    expect(text).toContain("$100")
  })

  it("renders a 3-column table with colspan", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        {
          type: "table", width: 9360, columnWidths: [3120, 3120, 3120],
          rows: [
            { cells: [
              { children: [{ type: "paragraph", children: [{ type: "text", text: "spans-all" }] }], colspan: 3 },
            ] },
            { cells: [
              { children: [{ type: "paragraph", children: [{ type: "text", text: "a" }] }] },
              { children: [{ type: "paragraph", children: [{ type: "text", text: "b" }] }] },
              { children: [{ type: "paragraph", children: [{ type: "text", text: "c" }] }] },
            ] },
          ],
        },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("spans-all")
    expect(text).toContain("a")
    expect(text).toContain("b")
    expect(text).toContain("c")
  })
})

describe("astToDocx — mermaid block", () => {
  const meta = {
    title: "T",
    pageSize: "letter" as const,
    orientation: "portrait" as const,
    font: "Arial",
    fontSize: 12,
    showPageNumbers: false,
  }

  it("embeds the rendered diagram as an image part", async () => {
    const buf = await astToDocx({
      meta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B", caption: "Fig 1" }],
    })
    expect(buf[0]).toBe(0x50) // zip magic
    expect(buf.length).toBeGreaterThan(5_000)
    const zipContent = buf.toString("binary")
    expect(zipContent).toMatch(/word\/media\//)
  })

  it("emits a caption paragraph after the diagram", async () => {
    const buf = await astToDocx({
      meta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B", caption: "My caption" }],
    })
    const text = (await mammoth.extractRawText({ buffer: buf })).value
    expect(text).toContain("My caption")
  })

  it("renders two mermaid blocks in the same process without DOMPurify singleton corruption", async () => {
    // First render
    const buf1 = await astToDocx({
      meta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B" }],
    })
    expect(buf1.toString("binary")).toMatch(/word\/media\//)

    // Second render — if DOMPurify broke, this would return a zip with no image (empty SVG)
    const buf2 = await astToDocx({
      meta,
      body: [{ type: "mermaid", code: "sequenceDiagram\n  Alice->>Bob: hello" }],
    })
    expect(buf2.toString("binary")).toMatch(/word\/media\//)
  })
  // Fallback path is covered at implementation-inspection time: the try/catch
  // in renderMermaid returns a red-italic caption paragraph on mermaid parse
  // failure. End-to-end mock coverage would add complexity without proportional value.
})
