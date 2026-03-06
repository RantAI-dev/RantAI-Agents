"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, ExternalLink, Square, Terminal } from "@/lib/icons"

type IdeState = "idle" | "starting" | "running" | "error"

interface WorkspaceIDEProps {
  employeeId: string
  ideStatus: { running: boolean; url?: string } | null
  fetchIdeStatus: () => Promise<void>
  startIde: () => Promise<{ url: string }>
  stopIde: () => Promise<void>
}

export function WorkspaceIDE({
  employeeId,
  ideStatus,
  fetchIdeStatus,
  startIde,
  stopIde,
}: WorkspaceIDEProps) {
  const [state, setState] = useState<IdeState>("idle")
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Sync state from ideStatus prop
  useEffect(() => {
    if (ideStatus?.running && ideStatus.url) {
      setState("running")
      setUrl(ideStatus.url)
    } else if (state === "running" && !ideStatus?.running) {
      setState("idle")
      setUrl(null)
    }
  }, [ideStatus, state])

  // Fetch IDE status on mount
  useEffect(() => {
    fetchIdeStatus()
  }, [fetchIdeStatus])

  const handleStart = useCallback(async () => {
    setState("starting")
    setError(null)
    try {
      const result = await startIde()
      setUrl(result.url)
      setState("running")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start IDE")
      setState("error")
    }
  }, [startIde])

  const handleStop = useCallback(async () => {
    try {
      await stopIde()
      setState("idle")
      setUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop IDE")
    }
  }, [stopIde])

  if (state === "idle") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <div className="rounded-full bg-muted p-4">
          <Terminal className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-sm font-medium">Workspace IDE</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Open a full code editor with file tree and terminal to browse and edit workspace files directly.
          </p>
        </div>
        <Button onClick={handleStart}>
          <Terminal className="h-4 w-4 mr-1.5" />
          Open Workspace
        </Button>
      </div>
    )
  }

  if (state === "starting") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Starting IDE...</p>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <div className="text-center space-y-1">
          <h3 className="text-sm font-medium text-destructive">Failed to start IDE</h3>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" onClick={handleStart}>
          Retry
        </Button>
      </div>
    )
  }

  // Running state — show toolbar + iframe
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-1.5 bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleStop}>
            <Square className="h-3.5 w-3.5 mr-1.5" />
            Stop IDE
          </Button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open in new tab
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-muted-foreground">Running</span>
        </div>
      </div>

      {/* IDE iframe */}
      {url && (
        <iframe
          src={url}
          className="flex-1 w-full border-0"
          allow="clipboard-read; clipboard-write"
          title="Workspace IDE"
        />
      )}
    </div>
  )
}
