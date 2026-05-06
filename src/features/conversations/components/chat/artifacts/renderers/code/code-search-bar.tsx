"use client"

import { useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, Search, X } from "@/lib/icons"

interface CodeSearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  matchIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

export function CodeSearchBar({
  query,
  onQueryChange,
  matchCount,
  matchIndex,
  onPrev,
  onNext,
  onClose,
}: CodeSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const showNoMatches = query.length > 0 && matchCount === 0
  const showCount = query.length > 0 && matchCount > 0

  return (
    <div
      role="dialog"
      aria-label="Search in code"
      data-code-search-popup="true"
      className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1.5 min-w-[260px] max-w-[320px] bg-background border border-border rounded-md shadow-md backdrop-blur-md"
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onClose()
          } else if (e.key === "Enter") {
            e.preventDefault()
            if (e.shiftKey) onPrev()
            else onNext()
          }
        }}
        placeholder="Search in code…"
        className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
      />
      {showCount && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {matchIndex + 1} of {matchCount}
        </span>
      )}
      {showNoMatches && (
        <span className="text-xs text-muted-foreground shrink-0">No matches</span>
      )}
      <button
        type="button"
        aria-label="Previous match"
        onClick={onPrev}
        disabled={matchCount === 0}
        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Next match"
        onClick={onNext}
        disabled={matchCount === 0}
        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="p-1 rounded hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
