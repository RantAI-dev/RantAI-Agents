/**
 * CSV tokenizer shared between the spreadsheet validator and the renderer.
 *
 * Field values are preserved untrimmed so callers agree byte-for-byte on what
 * the document contains — trimming is a display concern handled at render
 * time, not here.
 */
export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        current.push(field)
        field = ""
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        current.push(field)
        field = ""
        if (current.some((c) => c.trim().length > 0)) rows.push(current)
        current = []
        if (ch === "\r") i++
      } else {
        field += ch
      }
    }
  }
  if (field || current.length) {
    current.push(field)
    if (current.some((c) => c.trim().length > 0)) rows.push(current)
  }
  return rows
}
