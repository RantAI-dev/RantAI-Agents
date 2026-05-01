import { describe, it, expect } from "vitest"
import { parseNotebookContent, serializeNotebookContent } from "@/lib/notebook/serialize"
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
})
