"use client"

import { Play, Square, RotateCcw } from "@/lib/icons"
import type { KernelStatus } from "./use-kernel"

interface Props {
  kernelStatus: KernelStatus
  runningCellId: string | null
  pendingCount: number
  onRunAll: () => void
  onInterrupt: () => void
  onRestart: () => void
}

export function NotebookToolbar({
  kernelStatus,
  runningCellId,
  pendingCount,
  onRunAll,
  onInterrupt,
  onRestart,
}: Props) {
  const dot = {
    idle: "bg-muted-foreground",
    loading: "bg-yellow-500",
    ready: "bg-green-500",
    running: "bg-yellow-500 animate-pulse",
  }[kernelStatus]

  const label = {
    idle: "Idle",
    loading: "Loading kernel…",
    ready: "Kernel ready",
    running: runningCellId ? `Running [${runningCellId.slice(0, 6)}]` : "Running",
  }[kernelStatus]

  const runAllPrimary = pendingCount > 0
  const runAllPulse = pendingCount > 0 && kernelStatus !== "running" && kernelStatus !== "loading"

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0 text-xs">
      <button
        type="button"
        onClick={onRunAll}
        disabled={kernelStatus === "loading" || pendingCount === 0}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded ${
          runAllPrimary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"
        } ${runAllPulse ? "animate-pulse" : ""} disabled:opacity-50`}
      >
        <Play className="h-3.5 w-3.5" /> Run all
        {pendingCount > 0 && <span className="ml-1 text-[10px] opacity-80">({pendingCount})</span>}
      </button>
      <button
        type="button"
        onClick={onInterrupt}
        className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
      >
        <Square className="h-3.5 w-3.5" /> Interrupt
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Restart
      </button>
      <div className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
    </div>
  )
}
