"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { parseNotebookContentStreaming } from "@/lib/notebook/serialize"
import { makeCodeCell, makeMarkdownCell, type Cell, type NotebookContent } from "@/lib/notebook/types"
import { useKernel, type CellRuntimeState } from "./use-kernel"
import { NotebookCellView } from "./cell"
import { NotebookToolbar } from "./notebook-toolbar"
import { usePinToChat } from "./use-pin-to-chat"

interface Props {
  artifactId: string
  content: string
  onFixWithAI?: (err: string) => void
}

export function NotebookRenderer({ artifactId, content, onFixWithAI }: Props) {
  const initial = useMemo<NotebookContent>(() => parseNotebookContentStreaming(content), [content])
  const [nb, setNb] = useState<NotebookContent>(initial)
  const [runtime, setRuntime] = useState<Record<string, CellRuntimeState>>({})

  const onCellUpdate = useCallback((cellId: string, state: CellRuntimeState) => {
    setRuntime((prev) => ({ ...prev, [cellId]: state }))
  }, [])

  const { kernelStatus, runningCellId, runCell, runAll, interrupt, restart } = useKernel(onCellUpdate)
  const { togglePin, isPinned, sweepStale } = usePinToChat(artifactId)

  // Pins live in sessionStorage but cell ids are regenerated when the
  // notebook is re-parsed (e.g. after a kernel restart or LLM rewrite).
  // Drop pins whose cellId no longer exists so the pinned-outputs bar
  // doesn't carry references to ghosts.
  useEffect(() => {
    sweepStale(new Set(nb.cells.map((c) => c.id)))
  }, [nb.cells, sweepStale])

  const updateCell = useCallback((id: string, patch: Partial<Cell>) => {
    setNb((prev) => ({ ...prev, cells: prev.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  }, [])

  const insertBelow = useCallback((id: string, type: "code" | "markdown") => {
    setNb((prev) => {
      const idx = prev.cells.findIndex((c) => c.id === id)
      const cell = type === "code" ? makeCodeCell("") : makeMarkdownCell("")
      const cells = [...prev.cells.slice(0, idx + 1), cell, ...prev.cells.slice(idx + 1)]
      return { ...prev, cells }
    })
  }, [])

  const deleteCell = useCallback((id: string) => {
    setNb((prev) =>
      prev.cells.length <= 1 ? prev : { ...prev, cells: prev.cells.filter((c) => c.id !== id) },
    )
  }, [])

  const pendingCount = useMemo(
    () =>
      nb.cells.filter((c) => {
        if (c.type !== "code" || !c.source.trim()) return false
        const s = runtime[c.id]
        return !s || (s.status === "idle" && s.executionCount === null)
      }).length,
    [nb.cells, runtime],
  )

  if (nb.cells.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-sm text-muted-foreground">
        AI hasn&apos;t written anything yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <NotebookToolbar
        kernelStatus={kernelStatus}
        runningCellId={runningCellId}
        pendingCount={pendingCount}
        onRunAll={() => runAll(nb.cells)}
        onInterrupt={interrupt}
        onRestart={restart}
      />
      <div className="flex-1 overflow-auto px-6 py-4">
        {nb.cells.map((cell) => (
          <NotebookCellView
            key={cell.id}
            cell={cell}
            runtime={runtime[cell.id]}
            onChangeSource={(src) => updateCell(cell.id, { source: src })}
            onRun={() => runCell(cell.id, cell.source)}
            onDelete={() => deleteCell(cell.id)}
            onInsertBelow={(type) => insertBelow(cell.id, type)}
            onFixWithAI={onFixWithAI}
            isPinned={(idx) => isPinned(cell.id, idx)}
            onTogglePin={(idx) => togglePin(cell.id, idx)}
          />
        ))}
      </div>
    </div>
  )
}
