"use client"

import { useState } from "react"
import type { Output } from "@/lib/notebook/types"
import { AlertTriangle, Copy, Check } from "@/lib/icons"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { OutputPinOverlay } from "./output-pin-overlay"

interface Props {
  cellId: string
  outputs: Output[]
  imageTruncated: boolean
  isPinned: (outputIdx: number) => boolean
  onTogglePin: (outputIdx: number) => void
}

const COLLAPSE_LINE_THRESHOLD = 40
const COLLAPSE_KEEP_LINES = 20

export function CellOutput({
  cellId,
  outputs,
  imageTruncated,
  isPinned,
  onTogglePin,
}: Props) {
  if (outputs.length === 0 && !imageTruncated) return null

  return (
    <div className="border-t bg-muted/20">
      {outputs.map((o, i) => (
        <OutputItem
          key={i}
          idx={i}
          cellId={cellId}
          output={o}
          pinned={isPinned(i)}
          onTogglePin={() => onTogglePin(i)}
        />
      ))}
      {imageTruncated && (
        <div className="px-4 py-1.5 text-[11px] text-muted-foreground italic border-t border-dashed">
          Image not saved (over 100 KiB) — re-run on reload to regenerate.
        </div>
      )}
    </div>
  )
}

function OutputItem({
  idx,
  cellId,
  output,
  pinned,
  onTogglePin,
}: {
  idx: number
  cellId: string
  output: Output
  pinned: boolean
  onTogglePin: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (output.type === "stream") {
    return (
      <CollapsibleText
        text={output.text}
        stderr={output.name === "stderr"}
        expanded={expanded}
        setExpanded={setExpanded}
        onCopy={() => copy(output.text)}
        copied={copied}
      />
    )
  }

  if (output.type === "error") {
    const errStr = `${output.ename}: ${output.evalue}\n${output.traceback.join("\n")}`
    return (
      <div className="px-4 py-2 bg-destructive/5 border-y border-destructive/20 group/out relative">
        <div className="flex items-center justify-between mb-1">
          <span className="inline-flex items-center gap-1.5 text-destructive text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> {output.ename}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => copy(errStr)}
              className="text-[10px] px-2 py-0.5 rounded border bg-background hover:bg-muted inline-flex items-center gap-1"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <pre className="text-xs text-destructive/80 whitespace-pre-wrap font-mono">{errStr}</pre>
      </div>
    )
  }

  if (output.type === "display_data" || output.type === "execute_result") {
    const data = output.data as { "image/png"?: string; "text/html"?: string; "text/plain"?: string }
    if (data["image/png"]) {
      return (
        <div className="px-4 py-2 group/out relative">
          <Dialog>
            <DialogTrigger asChild>
              <img
                src={`data:image/png;base64,${data["image/png"]}`}
                alt={`Cell ${cellId} output ${idx + 1}`}
                className="max-w-full rounded border cursor-zoom-in"
              />
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto p-2">
              <img
                src={`data:image/png;base64,${data["image/png"]}`}
                alt={`Cell ${cellId} output ${idx + 1} large`}
                className="w-full h-auto"
              />
            </DialogContent>
          </Dialog>
          <OutputPinOverlay pinned={pinned} onTogglePin={onTogglePin} />
        </div>
      )
    }
    if (data["text/html"]) {
      return (
        <div className="group/out relative">
          <div
            className="px-4 py-2 text-xs overflow-auto [&_table.nb-df]:w-full [&_table.nb-df]:border-collapse [&_table.nb-df_th]:bg-muted/50 [&_table.nb-df_th]:px-2 [&_table.nb-df_th]:py-1 [&_table.nb-df_th]:text-left [&_table.nb-df_td]:px-2 [&_table.nb-df_td]:py-1 [&_table.nb-df_tr]:border-t"
            dangerouslySetInnerHTML={{ __html: data["text/html"] }}
          />
          {data["text/plain"] && (
            <button
              type="button"
              onClick={() => copy(data["text/plain"]!)}
              className="absolute right-2 top-2 hidden group-hover/out:inline-flex text-[10px] px-2 py-0.5 rounded border bg-background/90 hover:bg-muted items-center gap-1"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      )
    }
    if (data["text/plain"]) {
      return (
        <CollapsibleText
          text={data["text/plain"]}
          stderr={false}
          expanded={expanded}
          setExpanded={setExpanded}
          onCopy={() => copy(data["text/plain"]!)}
          copied={copied}
        />
      )
    }
  }
  return null
}

function CollapsibleText({
  text,
  stderr,
  expanded,
  setExpanded,
  onCopy,
  copied,
}: {
  text: string
  stderr: boolean
  expanded: boolean
  setExpanded: (v: boolean) => void
  onCopy: () => void
  copied: boolean
}) {
  const lines = text.split("\n")
  const overLimit = lines.length > COLLAPSE_LINE_THRESHOLD
  const visible = !overLimit || expanded ? text : lines.slice(0, COLLAPSE_KEEP_LINES).join("\n")

  return (
    <div className="group/out relative">
      <pre
        className={`px-4 py-1.5 text-xs whitespace-pre-wrap font-mono ${
          stderr ? "text-destructive/80" : "text-foreground"
        }`}
      >
        {visible}
      </pre>
      <div className="flex items-center justify-between px-4 py-0.5 text-[10px] text-muted-foreground">
        <div>
          {overLimit && (
            <button type="button" className="underline" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Collapse" : `Show ${lines.length - COLLAPSE_KEEP_LINES} more lines`}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="hidden group-hover/out:inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-background/90 hover:bg-muted"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}
