import {
  NotebookContentSchema,
  CellSchema,
  makeEmptyNotebook,
  makeCodeCell,
  type Cell,
  type NotebookContent,
} from "./types"

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

/**
 * Best-effort parser used while an artifact is still streaming. Returns
 * whatever cells can be extracted from a possibly-truncated JSON string so
 * partially-streamed notebooks render progressively instead of staying blank
 * until the closing brace lands.
 */
export function parseNotebookContentStreaming(raw: string): NotebookContent {
  const trimmed = raw.trim()

  if (!trimmed.startsWith("{")) {
    const nb = makeEmptyNotebook()
    nb.cells = [makeCodeCell(raw)]
    return nb
  }

  try {
    return parseNotebookContent(raw)
  } catch {
    // fall through to recovery
  }

  const cells = recoverCells(trimmed)
  if (cells.length === 0) {
    return makeEmptyNotebook()
  }
  return { cells, metadata: makeEmptyNotebook().metadata }
}

function recoverCells(raw: string): Cell[] {
  const cellsKey = '"cells"'
  const keyIdx = raw.indexOf(cellsKey)
  if (keyIdx === -1) return []
  const arrStart = raw.indexOf("[", keyIdx + cellsKey.length)
  if (arrStart === -1) return []
  const body = raw.slice(arrStart + 1)

  const out: Cell[] = []
  let i = 0
  while (i < body.length) {
    while (i < body.length && body[i] !== "{") i++
    if (i >= body.length) break
    const start = i
    let depth = 0
    let inString = false
    let escape = false
    let closed = false
    for (; i < body.length; i++) {
      const ch = body[i]
      if (escape) {
        escape = false
        continue
      }
      if (inString) {
        if (ch === "\\") {
          escape = true
          continue
        }
        if (ch === '"') {
          inString = false
        }
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          const objText = body.slice(start, i + 1)
          try {
            const parsed = JSON.parse(objText)
            const safe = CellSchema.safeParse(parsed)
            if (safe.success) out.push(safe.data)
          } catch {
            // skip unparseable cell object
          }
          i++
          closed = true
          break
        }
      }
    }
    if (!closed) break
  }
  return out
}
