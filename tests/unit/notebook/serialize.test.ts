import { describe, it, expect } from "vitest"
import {
  parseNotebookContent,
  parseNotebookContentStreaming,
  serializeNotebookContent,
} from "@/lib/notebook/serialize"
import { makeEmptyNotebook, makeCodeCell, NotebookContentSchema } from "@/lib/notebook/types"

describe("serialize", () => {
  it("round-trips a notebook through JSON", () => {
    const nb = makeEmptyNotebook()
    nb.cells.push(makeCodeCell("print('hi')"))
    const out = parseNotebookContent(serializeNotebookContent(nb))
    expect(out.cells.length).toBe(2)
    expect(out.cells[1].source).toBe("print('hi')")
  })

  it("wraps a bare python string as a single code-cell notebook", () => {
    const out = parseNotebookContent("print(1)\nprint(2)")
    expect(out.cells.length).toBe(1)
    expect(out.cells[0].type).toBe("code")
    expect(out.cells[0].source).toBe("print(1)\nprint(2)")
    expect(NotebookContentSchema.safeParse(out).success).toBe(true)
  })

  it("throws on malformed JSON that is neither a notebook nor a string", () => {
    expect(() => parseNotebookContent('{"cells": 5}')).toThrow()
  })

  // Regression: the LLM emits the minimal shape {type, source}. The parser
  // must hydrate id/outputs/executionCount with defaults instead of rejecting,
  // otherwise the panel mounts but renders zero cells.
  it("hydrates missing id/outputs/executionCount from minimal LLM shape", () => {
    const minimal = JSON.stringify({
      cells: [
        { type: "code", source: "print('hi')" },
        { type: "markdown", source: "# heading" },
      ],
    })
    const out = parseNotebookContent(minimal)
    expect(out.cells.length).toBe(2)
    expect(out.cells[0].source).toBe("print('hi')")
    expect(out.cells[0].outputs).toEqual([])
    expect(out.cells[0].executionCount).toBeNull()
    expect(typeof out.cells[0].id).toBe("string")
    expect(out.cells[0].id.length).toBeGreaterThan(0)
  })
})

describe("parseNotebookContentStreaming", () => {
  it("parses a complete notebook just like parseNotebookContent", () => {
    const nb = makeEmptyNotebook()
    nb.cells.push(makeCodeCell("x = 1"))
    const json = JSON.stringify(nb)
    const a = parseNotebookContent(json)
    const b = parseNotebookContentStreaming(json)
    expect(b.cells.length).toBe(a.cells.length)
    expect(b.cells.map((c) => c.source)).toEqual(a.cells.map((c) => c.source))
  })

  it("recovers complete cell objects from a JSON truncated mid-cell", () => {
    const nb = makeEmptyNotebook()
    nb.cells.push(makeCodeCell("print('a')"))
    nb.cells.push(makeCodeCell("print('b')"))
    const full = JSON.stringify(nb)
    const cutoff = full.indexOf("print('b')") + 5
    const truncated = full.slice(0, cutoff)
    const out = parseNotebookContentStreaming(truncated)
    expect(out.cells.length).toBeGreaterThanOrEqual(2)
    expect(out.cells.some((c) => c.source === "print('a')")).toBe(true)
  })

  it("falls back to a single bare-string code cell when input is plain python", () => {
    const out = parseNotebookContentStreaming("print(1)\nprint(2)")
    expect(out.cells.length).toBe(1)
    expect(out.cells[0].source).toBe("print(1)\nprint(2)")
  })

  it("returns an empty-shaped notebook for unparseable JSON garbage", () => {
    const out = parseNotebookContentStreaming('{"cells": [{')
    expect(out.cells.length).toBeGreaterThanOrEqual(1)
  })
})
