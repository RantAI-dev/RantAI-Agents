import { NotebookContentSchema, makeEmptyNotebook, makeCodeCell, type NotebookContent } from "./types"

export function serializeNotebookContent(nb: NotebookContent): string {
  return JSON.stringify(nb)
}

export function parseNotebookContent(raw: string): NotebookContent {
  const trimmed = raw.trim()

  if (trimmed.startsWith("{")) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error("Notebook content is not valid JSON")
    }
    const result = NotebookContentSchema.safeParse(parsed)
    if (result.success) return result.data
    throw new Error(`Notebook content failed schema validation: ${result.error.message}`)
  }

  const nb = makeEmptyNotebook()
  nb.cells = [makeCodeCell(raw)]
  return nb
}
