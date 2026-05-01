"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Square, RotateCcw, Download, ChevronDown } from "@/lib/icons"
import type { KernelStatus } from "./use-kernel"

interface Props {
  kernelStatus: KernelStatus
  runningCellId: string | null
  pendingCount: number
  onRunAll: () => void
  onInterrupt: () => void
  onRestart: () => void
  onDownload: (format: "ipynb" | "py" | "html") => void
}

export function NotebookToolbar({
  kernelStatus,
  runningCellId,
  pendingCount,
  onRunAll,
  onInterrupt,
  onRestart,
  onDownload,
}: Props) {
  const [open, setOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ddRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

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
      <div ref={ddRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" /> Download <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div className="absolute right-0 mt-1 w-48 bg-popover border rounded-md shadow-md z-20 py-1">
            {(["ipynb", "py", "html"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onDownload(f)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-muted text-xs"
              >
                {f === "ipynb"
                  ? ".ipynb (Jupyter)"
                  : f === "py"
                    ? ".py (percent format)"
                    : ".html (rendered)"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
    </div>
  )
}
