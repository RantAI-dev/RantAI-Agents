import { describe, it, expect } from "vitest"
import { NotebookContentSchema, makeEmptyNotebook, makeCodeCell, makeMarkdownCell } from "@/lib/notebook/types"

describe("notebook types", () => {
  it("makeEmptyNotebook produces a valid 1-cell notebook", () => {
    const nb = makeEmptyNotebook()
    expect(nb.cells.length).toBe(1)
    expect(nb.cells[0].type).toBe("code")
    expect(nb.cells[0].source).toBe("")
    expect(NotebookContentSchema.safeParse(nb).success).toBe(true)
  })

  it("makeCodeCell and makeMarkdownCell produce valid cells", () => {
    const code = makeCodeCell("print(1)")
    const md = makeMarkdownCell("# Title")
    expect(code.type).toBe("code")
    expect(code.executionCount).toBeNull()
    expect(md.type).toBe("markdown")
    expect(md.outputs).toEqual([])
  })

  it("rejects malformed notebook content", () => {
    expect(NotebookContentSchema.safeParse({ cells: "nope" }).success).toBe(false)
  })
})
