import { describe, it, expect } from "vitest"
import { toHtml } from "@/lib/notebook/html-export"
import { makeEmptyNotebook, makeCodeCell, makeMarkdownCell } from "@/lib/notebook/types"

describe("html export", () => {
  it("renders code, markdown, and outputs into a self-contained html string", () => {
    const nb = makeEmptyNotebook()
    nb.cells = [
      makeMarkdownCell("# Title"),
      { ...makeCodeCell("print('hi')"), outputs: [{ type: "stream", name: "stdout", text: "hi\n" }], executionCount: 1 },
    ]
    const html = toHtml(nb, { title: "Test" })
    expect(html).toContain("<title>Test</title>")
    expect(html).toContain("# Title")
    expect(html).toContain("print(&#39;hi&#39;)")
    expect(html).toContain("hi")
  })
})
