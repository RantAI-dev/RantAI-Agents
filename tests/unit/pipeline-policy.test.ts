import { describe, it, expect } from "vitest"
import { resolveIngestPolicy, parseFigureMode } from "@/lib/ingest/pipeline-policy"

describe("resolveIngestPolicy", () => {
  it("tabular files skip entities and figures", () => {
    for (const name of ["data.xlsx", "data.xls", "d.ods", "d.csv", "d.tsv", "d.json", "d.jsonl"]) {
      const p = resolveIngestPolicy(name)
      expect(p.entities, name).toBe(false)
      expect(p.figures, name).toBe(false)
      expect(p.forceLayout, name).toBe(false)
    }
  })

  it("pdf auto: figures possible, layout not forced", () => {
    const p = resolveIngestPolicy("book.pdf")
    expect(p.entities).toBe(true)
    expect(p.figures).toBe(true)
    expect(p.forceLayout).toBe(false)
  })

  it("pdf force: layout chain forced", () => {
    const p = resolveIngestPolicy("book.pdf", "force")
    expect(p.figures).toBe(true)
    expect(p.forceLayout).toBe(true)
  })

  it("pdf skip: no figures even if scanned", () => {
    const p = resolveIngestPolicy("scan.pdf", "skip")
    expect(p.figures).toBe(false)
    expect(p.forceLayout).toBe(false)
  })

  it("figureMode is ignored for non-pdf", () => {
    const p = resolveIngestPolicy("data.xlsx", "force")
    expect(p.figures).toBe(false)
    expect(p.forceLayout).toBe(false)
  })

  it("prose documents get entities but no figures", () => {
    for (const name of ["a.docx", "a.doc", "a.pptx", "a.md", "a.txt", "a.html", "a.rtf", "a.epub"]) {
      const p = resolveIngestPolicy(name)
      expect(p.entities, name).toBe(true)
      expect(p.figures, name).toBe(false)
    }
  })

  it("code, config, images, and 3D models skip entities", () => {
    for (const name of ["a.py", "a.ts", "a.yaml", "a.env", "img.png", "m.glb"]) {
      expect(resolveIngestPolicy(name).entities, name).toBe(false)
    }
  })

  it("case-insensitive extensions", () => {
    expect(resolveIngestPolicy("DATA.XLSX").entities).toBe(false)
    expect(resolveIngestPolicy("BOOK.PDF").figures).toBe(true)
  })
})

describe("parseFigureMode", () => {
  it("accepts the three valid values", () => {
    expect(parseFigureMode("auto")).toBe("auto")
    expect(parseFigureMode("force")).toBe("force")
    expect(parseFigureMode("skip")).toBe("skip")
  })
  it("maps legacy forceOCR to force", () => {
    expect(parseFigureMode(undefined, true)).toBe("force")
    expect(parseFigureMode(undefined, "true")).toBe("force")
  })
  it("defaults to auto on garbage", () => {
    expect(parseFigureMode("yes")).toBe("auto")
    expect(parseFigureMode(null)).toBe("auto")
    expect(parseFigureMode(undefined, false)).toBe("auto")
  })
})
