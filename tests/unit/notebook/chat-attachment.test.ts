import { describe, it, expect } from "vitest"
import { collectAutoAttachments } from "@/lib/notebook/chat-attachment"
import { makeEmptyNotebook, makeCodeCell, type NotebookContent } from "@/lib/notebook/types"

const CAPS = { maxTextChars: 8000, maxAttachments: 10 }

function withCells(cells: NotebookContent["cells"]): NotebookContent {
  return { ...makeEmptyNotebook(), cells }
}

describe("collectAutoAttachments", () => {
  it("returns no attachments for an empty notebook", () => {
    expect(collectAutoAttachments(makeEmptyNotebook(), [], CAPS)).toEqual([])
  })

  it("auto-attaches stream stdout text", () => {
    const cells = [makeCodeCell("print(1)")]
    cells[0].outputs = [{ type: "stream", name: "stdout", text: "1\n" }]
    const out = collectAutoAttachments(withCells(cells), [], CAPS)
    expect(out.length).toBe(1)
    expect(out[0].kind).toBe("text")
  })

  it("auto-attaches errors unconditionally", () => {
    const cells = [makeCodeCell("1/0")]
    cells[0].outputs = [
      { type: "error", ename: "ZeroDivisionError", evalue: "division by zero", traceback: ["..."] },
    ]
    const out = collectAutoAttachments(withCells(cells), [], CAPS)
    expect(out.length).toBe(1)
    expect(out[0].kind).toBe("error")
  })

  it("does NOT auto-attach images unless pinned", () => {
    const cells = [makeCodeCell("plt.show()")]
    cells[0].outputs = [{ type: "display_data", data: { "image/png": "AAAA" } }]
    expect(collectAutoAttachments(withCells(cells), [], CAPS)).toEqual([])
  })

  it("attaches a pinned image", () => {
    const cells = [makeCodeCell("plt.show()")]
    cells[0].outputs = [{ type: "display_data", data: { "image/png": "AAAA" } }]
    const pinned = [{ artifactId: "x", cellId: cells[0].id, outputIdx: 0 }]
    const out = collectAutoAttachments(withCells(cells), pinned, CAPS)
    expect(out.length).toBe(1)
    expect(out[0].kind).toBe("image")
  })

  it("respects maxTextChars cap, keeping the most recent text", () => {
    const cells = [makeCodeCell("a"), makeCodeCell("b")]
    cells[0].outputs = [{ type: "stream", name: "stdout", text: "x".repeat(6000) }]
    cells[1].outputs = [{ type: "stream", name: "stdout", text: "y".repeat(6000) }]
    const out = collectAutoAttachments(withCells(cells), [], { maxTextChars: 8000, maxAttachments: 10 })
    const totalChars = out
      .filter((o) => o.kind === "text")
      .reduce((n, o) => n + (o.kind === "text" ? o.text.length : 0), 0)
    expect(totalChars).toBeLessThanOrEqual(8000)
    expect(out.some((o) => o.kind === "text" && o.text.includes("y"))).toBe(true)
  })

  it("caps total attachments via maxAttachments", () => {
    const cells = Array.from({ length: 20 }, (_, i) => {
      const c = makeCodeCell("print()")
      c.outputs = [{ type: "stream", name: "stdout", text: `${i}\n` }]
      return c
    })
    const out = collectAutoAttachments(withCells(cells), [], { maxTextChars: 100000, maxAttachments: 5 })
    expect(out.length).toBe(5)
  })
})
