import type { NotebookContent } from "./types"

export function toPercent(nb: NotebookContent): string {
  const blocks = nb.cells.map((c) => {
    if (c.type === "markdown") {
      const commented = c.source.split("\n").map((l) => `# ${l}`).join("\n")
      return `# %% [markdown]\n${commented}`
    }
    return `# %%\n${c.source}`
  })
  return blocks.join("\n\n") + "\n"
}
