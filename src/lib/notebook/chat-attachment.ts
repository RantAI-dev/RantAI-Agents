import type { NotebookContent } from "./types"

export type PinnedRef = { artifactId: string; cellId: string; outputIdx: number }

export type ChatAttachment =
  | { kind: "text"; cellId: string; text: string }
  | { kind: "error"; cellId: string; ename: string; evalue: string; traceback: string[] }
  | { kind: "image"; cellId: string; outputIdx: number; pngBase64: string; alt: string }

export type AttachmentCaps = { maxTextChars: number; maxAttachments: number }

const ERROR_LIMIT = 3

export function collectAutoAttachments(
  notebook: NotebookContent,
  pinned: PinnedRef[],
  caps: AttachmentCaps,
): ChatAttachment[] {
  const errors: ChatAttachment[] = []
  const texts: ChatAttachment[] = []

  for (const cell of notebook.cells) {
    for (const o of cell.outputs) {
      if (o.type === "error") {
        errors.push({
          kind: "error",
          cellId: cell.id,
          ename: o.ename,
          evalue: o.evalue,
          traceback: o.traceback,
        })
        continue
      }
      if (o.type === "stream") {
        if (o.text.length > 0) texts.push({ kind: "text", cellId: cell.id, text: o.text })
        continue
      }
      if (o.type === "display_data" || o.type === "execute_result") {
        const txt = (o.data as { "text/plain"?: string })["text/plain"]
        if (txt) texts.push({ kind: "text", cellId: cell.id, text: txt })
      }
    }
  }

  const images: ChatAttachment[] = []
  for (const p of pinned) {
    const cell = notebook.cells.find((c) => c.id === p.cellId)
    if (!cell) continue
    const out = cell.outputs[p.outputIdx]
    if (!out) continue
    if (out.type === "display_data" || out.type === "execute_result") {
      const png = (out.data as { "image/png"?: string })["image/png"]
      if (png) {
        images.push({
          kind: "image",
          cellId: p.cellId,
          outputIdx: p.outputIdx,
          pngBase64: png,
          alt: `Cell ${p.cellId} output`,
        })
      }
    }
  }

  const cappedTexts: ChatAttachment[] = []
  let charBudget = caps.maxTextChars
  for (let i = texts.length - 1; i >= 0 && charBudget > 0; i--) {
    const t = texts[i]
    if (t.kind !== "text") continue
    const slice = t.text.slice(-charBudget)
    cappedTexts.unshift({ kind: "text", cellId: t.cellId, text: slice })
    charBudget -= slice.length
  }

  const cappedErrors = errors.slice(-ERROR_LIMIT)
  const all: ChatAttachment[] = [...cappedErrors, ...cappedTexts, ...images]
  return all.slice(-caps.maxAttachments)
}
