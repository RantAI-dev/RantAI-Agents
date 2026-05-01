import { describe, it, expect } from "vitest"
import { toPercent } from "@/lib/notebook/percent"
import { makeEmptyNotebook, makeCodeCell, makeMarkdownCell } from "@/lib/notebook/types"

describe("percent format", () => {
  it("emits # %% blocks for code and # %% [markdown] for markdown", () => {
    const nb = makeEmptyNotebook()
    nb.cells = [
      makeCodeCell("import numpy as np\nx = 1"),
      makeMarkdownCell("# Header\nText body"),
      makeCodeCell("print(x)"),
    ]
    const out = toPercent(nb)
    expect(out).toBe(
      "# %%\nimport numpy as np\nx = 1\n\n# %% [markdown]\n# # Header\n# Text body\n\n# %%\nprint(x)\n"
    )
  })
})
