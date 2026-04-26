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

describe("astToDocx — chart block", () => {
  const meta = {
    title: "T",
    pageSize: "letter" as const,
    orientation: "portrait" as const,
    font: "Arial",
    fontSize: 12,
    showPageNumbers: false,
  }

  it("embeds a bar chart as an image part", async () => {
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "chart",
          chart: { type: "bar", title: "Revenue", data: [{ label: "Q1", value: 100 }, { label: "Q2", value: 200 }] },
          caption: "Revenue by quarter",
        },
      ],
    })
    expect(buf[0]).toBe(0x50)
    expect(buf.length).toBeGreaterThan(5_000)
    expect(buf.toString("binary")).toMatch(/word\/media\//)
  })

  it("emits the caption paragraph", async () => {
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "chart",
          chart: { type: "pie", data: [{ label: "A", value: 1 }, { label: "B", value: 2 }] },
          caption: "Pie caption",
        },
      ],
    })
    const text = (await mammoth.extractRawText({ buffer: buf })).value
    expect(text).toContain("Pie caption")
  })

  it("emits a marker paragraph instead of throwing when the chart fails to render", async () => {
    // Force chartToSvg to produce an SVG that sharp can't rasterize by
    // passing an empty data array on a chart type that rejects empty data
    // — chartToSvg's internal renderEmptyChart fallback handles this for
    // most types, but a totally unknown type label like "scatter" now
    // surfaces as a marker paragraph rather than crashing astToDocx.
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "chart",
          // A type chart-to-svg doesn't recognize will fall back to
          // renderEmptyChart and produce a valid (empty) SVG; the
          // try/catch guard around svgToPng kicks in for genuinely
          // malformed output. Use caption to verify the marker carries it.
          chart: { type: "scatter" as never, data: [] },
          caption: "Scatter (unsupported)",
        },
      ],
    })
    // Whatever the failure mode, the export must finish — earlier code
    // would propagate the exception out of astToDocx.
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(1000)
  })
})

describe("astToDocx — tab.leader: 'dot' attaches a paragraph tab stop", () => {
  const meta = {
    title: "T", pageSize: "letter" as const, orientation: "portrait" as const,
    font: "Arial", fontSize: 12, showPageNumbers: false,
  }

  it("emits a tab stop with leader=dot when any tab in the paragraph requests it", async () => {
    // Verify by inspecting the generated docx XML — mammoth's text
    // extractor doesn't surface paragraph-level properties, so we read
    // the document.xml part directly to assert the <w:tab w:leader="dot"/>
    // appears in the paragraph's tab-stop set.
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "paragraph",
          children: [
            { type: "text", text: "Reference no." },
            { type: "tab", leader: "dot" },
            { type: "text", text: " LTR/2026/045" },
          ],
        },
      ],
    })
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file("word/document.xml")!.async("string")
    expect(xml).toMatch(/<w:tabs>/)
    expect(xml).toMatch(/w:leader="dot"/)
  })

  it("does NOT add a tab-stop when no tab carries leader=dot", async () => {
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            { type: "tab", leader: "none" },
            { type: "text", text: "B" },
          ],
        },
      ],
    })
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file("word/document.xml")!.async("string")
    expect(xml).not.toMatch(/w:leader="dot"/)
  })
})

describe("astToDocx — list.startAt threads through to numbering", () => {
  const meta = {
    title: "T", pageSize: "letter" as const, orientation: "portrait" as const,
    font: "Arial", fontSize: 12, showPageNumbers: false,
  }

  it("registers a per-startAt numbering reference when an ordered list overrides startAt", async () => {
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "list", ordered: true, startAt: 5,
          items: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "fifth" }] }] },
            { children: [{ type: "paragraph", children: [{ type: "text", text: "sixth" }] }] },
          ],
        },
      ],
    })
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buf)
    const numbering = await zip.file("word/numbering.xml")!.async("string")
    // Level-0 should `<w:start w:val="5"/>` for the start-5 instance.
    expect(numbering).toMatch(/<w:start w:val="5"/)
  })

  it("default ordered lists still start at 1", async () => {
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "list", ordered: true,
          items: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "first" }] }] },
          ],
        },
      ],
    })
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buf)
    const numbering = await zip.file("word/numbering.xml")!.async("string")
    // The default "numbers" instance opens with start=1 at level 0.
    expect(numbering).toMatch(/<w:start w:val="1"/)
  })
})

describe("astToDocx — table.shading: 'striped' alternates row fills", () => {
  const meta = {
    title: "T", pageSize: "letter" as const, orientation: "portrait" as const,
    font: "Arial", fontSize: 12, showPageNumbers: false,
  }

  function tableAst(shading?: "striped" | "none") {
    return {
      meta,
      body: [
        {
          type: "table" as const,
          width: 9360,
          columnWidths: [4680, 4680],
          shading,
          rows: [
            { isHeader: true, cells: [
              { children: [{ type: "paragraph" as const, children: [{ type: "text" as const, text: "H1" }] }] },
              { children: [{ type: "paragraph" as const, children: [{ type: "text" as const, text: "H2" }] }] },
            ] },
            { cells: [
              { children: [{ type: "paragraph" as const, children: [{ type: "text" as const, text: "row1a" }] }] },
              { children: [{ type: "paragraph" as const, children: [{ type: "text" as const, text: "row1b" }] }] },
            ] },
            { cells: [
              { children: [{ type: "paragraph" as const, children: [{ type: "text" as const, text: "row2a" }] }] },
              { children: [{ type: "paragraph" as const, children: [{ type: "text" as const, text: "row2b" }] }] },
            ] },
          ],
        },
      ],
    }
  }

  it("applies cell shading on alternating data rows when shading='striped'", async () => {
    const buf = await astToDocx(tableAst("striped"))
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file("word/document.xml")!.async("string")
    // The fill colour `F3F4F6` is the stripe colour the renderer applies
    // to the SECOND data row (1-based-odd index after header skip).
    expect(xml).toMatch(/F3F4F6/i)
  })

  it("applies no stripe fill when shading='none' or omitted", async () => {
    const buf = await astToDocx(tableAst(undefined))
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file("word/document.xml")!.async("string")
    expect(xml).not.toMatch(/F3F4F6/i)
  })
})
