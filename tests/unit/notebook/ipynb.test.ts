import { describe, it, expect } from "vitest"
import { toIpynb, fromIpynb } from "@/lib/notebook/ipynb"
import { makeEmptyNotebook, makeCodeCell, makeMarkdownCell } from "@/lib/notebook/types"

describe("ipynb", () => {
  it("toIpynb produces nbformat v4 with split source lines", () => {
    const nb = makeEmptyNotebook()
    nb.cells = [makeCodeCell("print(1)\nprint(2)"), makeMarkdownCell("# Title\nbody")]
    const ipynb = toIpynb(nb)
    expect(ipynb.nbformat).toBe(4)
    expect(ipynb.cells[0].cell_type).toBe("code")
    expect(ipynb.cells[0].source).toEqual(["print(1)\n", "print(2)"])
    expect(ipynb.cells[1].cell_type).toBe("markdown")
    expect(ipynb.cells[1].source).toEqual(["# Title\n", "body"])
  })

  it("fromIpynb round-trips with toIpynb", () => {
    const nb = makeEmptyNotebook()
    nb.cells = [makeCodeCell("x = 1"), makeMarkdownCell("note")]
    const back = fromIpynb(toIpynb(nb))
    expect(back.cells.length).toBe(2)
    expect(back.cells[0].source).toBe("x = 1")
    expect(back.cells[1].type).toBe("markdown")
    expect(back.cells[1].source).toBe("note")
  })

  it("fromIpynb handles outputs and execution_count from a Jupyter file", () => {
    const sample = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { name: "python3", display_name: "Python 3" }, language_info: { name: "python", version: "3.12" } },
      cells: [
        {
          cell_type: "code",
          source: ["print('hi')"],
          execution_count: 7,
          outputs: [{ output_type: "stream", name: "stdout", text: ["hi\n"] }],
          metadata: {},
        },
      ],
    }
    const nb = fromIpynb(sample as any)
    expect(nb.cells[0].executionCount).toBe(7)
    expect(nb.cells[0].outputs.length).toBe(1)
    expect(nb.cells[0].outputs[0]).toMatchObject({ type: "stream", name: "stdout", text: "hi\n" })
  })
})
