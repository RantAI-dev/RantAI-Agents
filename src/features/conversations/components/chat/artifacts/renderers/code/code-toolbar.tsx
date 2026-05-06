"use client"

import { AlertTriangle, GitCompareArrows, Search, WrapText } from "@/lib/icons"

interface CodeToolbarProps {
  language: string | undefined
  isCanonicalLanguage: boolean
  isStreaming: boolean
  wrap: boolean
  onWrapToggle: () => void
  searchOpen: boolean
  onSearchToggle: () => void
  diffMode: boolean
  onDiffToggle: () => void
  diffEnabled: boolean
  diffDisabledReason?: string
}

export function CodeToolbar({
  language,
  isCanonicalLanguage,
  isStreaming,
  wrap,
  onWrapToggle,
  searchOpen,
  onSearchToggle,
  diffMode,
  onDiffToggle,
  diffEnabled,
  diffDisabledReason,
}: CodeToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-muted/20 text-xs shrink-0">
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
        {language ?? "plain"}
        {!isCanonicalLanguage && (
          <span
            aria-label="Off-canonical language — Shiki may render this as plain text"
            title="Off-canonical language — Shiki may render this as plain text"
            className="text-amber-500"
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </span>
      {isStreaming && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          writing…
        </span>
      )}

      <div className="flex-1" />

      <button
        type="button"
        aria-label={wrap ? "Disable line wrap" : "Enable line wrap"}
        title={wrap ? "Disable line wrap" : "Enable line wrap"}
        data-active={wrap ? "true" : "false"}
        onClick={onWrapToggle}
        className={
          "p-1 rounded hover:bg-muted " +
          (wrap ? "outline outline-1 outline-foreground/40" : "")
        }
      >
        <WrapText className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        aria-label={searchOpen ? "Close search" : "Search in code"}
        title={searchOpen ? "Close search" : "Search in code (Ctrl+F)"}
        data-active={searchOpen ? "true" : "false"}
        onClick={onSearchToggle}
        className={
          "p-1 rounded hover:bg-muted " +
          (searchOpen ? "outline outline-1 outline-foreground/40" : "")
        }
      >
        <Search className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        aria-label={diffMode ? "Hide diff" : "Show diff vs previous version"}
        title={diffEnabled ? (diffMode ? "Hide diff" : "Show diff vs previous version") : diffDisabledReason}
        data-active={diffMode ? "true" : "false"}
        onClick={onDiffToggle}
        disabled={!diffEnabled}
        className={
          "p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed " +
          (diffMode ? "outline outline-1 outline-foreground/40" : "")
        }
      >
        <GitCompareArrows className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
