"use client"

import { useState } from "react"
import type { Cell as CellModel } from "@/lib/notebook/types"
import { CodeCellEditor } from "./code-cell-editor"
import { CellOutput } from "./cell-output"
import { MarkdownCell } from "./markdown-cell"
import { Play, Loader2, Plus, Trash2 } from "@/lib/icons"
import type { CellRuntimeState } from "./use-kernel"

interface Props {
  cell: CellModel
  runtime?: CellRuntimeState
  onChangeSource: (next: string) => void
  onRun: () => void
  onRunAndAdvance?: () => void
  onDelete: () => void
  onInsertBelow: (type: "code" | "markdown") => void
  isPinned: (outputIdx: number) => boolean
  onTogglePin: (outputIdx: number) => void
  freshlyAuthored?: boolean
}

function counterText(runtime: CellRuntimeState | undefined, executionCount: number | null): string {
  if (runtime?.status === "running") return "*"
  if (runtime?.status === "queued") return "…"
  if (runtime?.executionCount != null) return String(runtime.executionCount)
  if (executionCount != null) return String(executionCount)
  return " "
}

export function NotebookCellView({
  cell,
  runtime,
  onChangeSource,
  onRun,
  onRunAndAdvance,
  onDelete,
  onInsertBelow,
  isPinned,
  onTogglePin,
  freshlyAuthored,
}: Props) {
  const [focused, setFocused] = useState(false)
  const status = runtime?.status ?? "idle"
  const counter = counterText(runtime, cell.executionCount)
  const tone = freshlyAuthored
    ? "border-primary/40"
    : focused
      ? "border-primary/60"
      : "border-border"

  const isMarkdown = cell.type === "markdown"

  return (
    <div
      className={`group relative border ${tone} rounded-md bg-background mb-3 transition-colors`}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false)
      }}
    >
      {!isMarkdown && (
        <>
          <div className="flex items-start">
            <div className="w-12 shrink-0 pt-2 text-center text-xs font-mono text-muted-foreground select-none">
              [{counter}]
            </div>
            <div className="flex-1 min-w-0">
              <CodeCellEditor
                value={cell.source}
                onChange={onChangeSource}
                onRun={onRun}
                onRunAndAdvance={onRunAndAdvance}
              />
            </div>
            <div className="shrink-0 pt-1 pr-1">
              <button
                type="button"
                onClick={onRun}
                disabled={status === "running" || status === "queued"}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label="Run cell"
                title="Run cell (⌘/Ctrl+Enter)"
              >
                {status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <CellOutput
            cellId={cell.id}
            outputs={runtime?.outputs ?? cell.outputs}
            imageTruncated={runtime?.imageTruncated ?? false}
            isPinned={isPinned}
            onTogglePin={onTogglePin}
          />
        </>
      )}

      {isMarkdown && <MarkdownCell source={cell.source} onChange={onChangeSource} />}

      <div className="flex items-center justify-between px-3 py-1 text-[10px] text-muted-foreground">
        <div>
          {!isMarkdown &&
            runtime?.lastRunDurationMs != null &&
            status !== "running" &&
            status !== "queued" && <span>ran in {(runtime.lastRunDurationMs / 1000).toFixed(2)}s</span>}
        </div>
        <div className="hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={() => onInsertBelow("code")}
            className="px-1.5 py-0.5 rounded border bg-background hover:bg-muted inline-flex items-center gap-0.5"
          >
            <Plus className="h-3 w-3" /> Code
          </button>
          <button
            type="button"
            onClick={() => onInsertBelow("markdown")}
            className="px-1.5 py-0.5 rounded border bg-background hover:bg-muted inline-flex items-center gap-0.5"
          >
            <Plus className="h-3 w-3" /> Markdown
          </button>
          {focused && (
            <button
              type="button"
              onClick={onDelete}
              className="px-1.5 py-0.5 rounded border bg-background hover:bg-destructive/10 hover:text-destructive inline-flex items-center gap-0.5"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
