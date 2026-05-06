"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Artifact } from "../../types"
import { CodeStatusBar } from "./code-status-bar"
import { CodeSearchBar } from "./code-search-bar"
import { CodeSourceView } from "./code-source-view"
import { CodeDiffView, type DiffLayout } from "./code-diff-view"
import type { PrevVersionFetchResult, PrevVersionState } from "./code-diff-view"
import { findMatches } from "./lib/search"

interface CodeRendererProps {
  artifact: Artifact
  /** True when the artifact has at least one previous version. */
  hasPreviousVersion: boolean
  /** Version number of the immediately previous version (1-indexed). */
  previousVersionNum?: number
  /** Lazy fetcher for previous-version content. Invoked on first diff entry; results cached panel-side. */
  fetchPreviousVersion?: () => Promise<PrevVersionFetchResult>
  /** Wired by the panel to handleRestoreVersion. */
  onRestoreVersion?: (versionNum: number) => void
  /** Controlled view mode — owned by ArtifactPanel so the panel-header diff pill can drive it. */
  mode: "source" | "diff"
  /** Notifies the panel of mode transitions (and force-resets when diff becomes unavailable). */
  onModeChange: (mode: "source" | "diff") => void
}

function wrapStorageKey(artifactId: string): string {
  return `code-wrap:${artifactId}`
}

export function CodeRenderer({
  artifact,
  hasPreviousVersion,
  previousVersionNum,
  fetchPreviousVersion,
  onRestoreVersion,
  mode,
  onModeChange,
}: CodeRendererProps) {
  const isStreaming = artifact.id.startsWith("streaming-")
  const language = artifact.language

  const [wrap, setWrap] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.sessionStorage.getItem(wrapStorageKey(artifact.id)) === "true"
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [matchIndex, setMatchIndex] = useState(0)
  const [diffLayout, setDiffLayout] = useState<DiffLayout>("unified")
  const [prevVersionState, setPrevVersionState] = useState<PrevVersionState>("idle")

  const containerRef = useRef<HTMLDivElement>(null)

  const diffEnabled = !isStreaming && hasPreviousVersion

  // Force-reset to source mode if diff becomes unavailable.
  useEffect(() => {
    if (!diffEnabled && mode === "diff") onModeChange("source")
  }, [diffEnabled, mode, onModeChange])

  // Reset prev-version state whenever the artifact id or compared version changes.
  useEffect(() => {
    setPrevVersionState("idle")
  }, [artifact.id, previousVersionNum])

  // Trigger the lazy fetch when the user enters diff mode for the first time.
  useEffect(() => {
    if (mode !== "diff") return
    if (prevVersionState !== "idle") return
    if (!fetchPreviousVersion) {
      setPrevVersionState({ kind: "error", message: "no fetcher provided" })
      return
    }
    let cancelled = false
    setPrevVersionState("loading")
    fetchPreviousVersion()
      .then((result) => {
        if (!cancelled) setPrevVersionState(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setPrevVersionState({
            kind: "error",
            message: err instanceof Error ? err.message : "fetch failed",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [mode, prevVersionState, fetchPreviousVersion])

  // Persist wrap.
  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem(wrapStorageKey(artifact.id), wrap ? "true" : "false")
  }, [artifact.id, wrap])

  const matches = useMemo(() => {
    if (!searchOpen || !searchQuery) return []
    return findMatches(artifact.content, searchQuery)
  }, [searchOpen, searchQuery, artifact.content])

  useEffect(() => {
    if (matchIndex >= matches.length) setMatchIndex(0)
  }, [matchIndex, matches.length])

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery("")
    setMatchIndex(0)
  }, [])

  const handleSearchPrev = useCallback(() => {
    if (matches.length === 0) return
    setMatchIndex((i) => (i - 1 + matches.length) % matches.length)
  }, [matches.length])

  const handleSearchNext = useCallback(() => {
    if (matches.length === 0) return
    setMatchIndex((i) => (i + 1) % matches.length)
  }, [matches.length])

  const handleDiffRetry = useCallback(() => {
    setPrevVersionState("idle")
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        if (!searchOpen) setSearchOpen(true)
      }
    },
    [searchOpen],
  )

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="relative flex-1 overflow-auto">
        {searchOpen && (
          <CodeSearchBar
            query={searchQuery}
            onQueryChange={(q) => {
              setSearchQuery(q)
              setMatchIndex(0)
            }}
            matchCount={matches.length}
            matchIndex={matchIndex}
            onPrev={handleSearchPrev}
            onNext={handleSearchNext}
            onClose={handleSearchClose}
          />
        )}
        {mode === "source" ? (
          <CodeSourceView
            content={artifact.content}
            language={language}
            wrap={wrap}
            searchQuery={searchOpen ? searchQuery : ""}
            currentMatchIndex={searchOpen && matches.length > 0 ? matchIndex : undefined}
          />
        ) : (
          <CodeDiffView
            prevState={prevVersionState}
            after={artifact.content}
            layout={diffLayout}
            onLayoutChange={setDiffLayout}
            wrap={wrap}
            onRestorePrevious={onRestoreVersion}
            previousVersionNum={previousVersionNum ?? 1}
            onRetry={handleDiffRetry}
          />
        )}
      </div>
      <CodeStatusBar
        lineCount={artifact.content.split("\n").length}
        wrap={wrap}
        onWrapToggle={() => setWrap((w) => !w)}
        onSearchOpen={() => setSearchOpen(true)}
      />
    </div>
  )
}
