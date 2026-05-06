"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Artifact } from "../../types"
import { CodeToolbar } from "./code-toolbar"
import { CodeSearchBar } from "./code-search-bar"
import { CodeSourceView } from "./code-source-view"
import { CodeDiffView, type DiffLayout } from "./code-diff-view"
import type { PrevVersionFetchResult, PrevVersionState } from "./code-diff-view"
import { findMatches } from "./lib/search"
import { CODE_LANGUAGE_EXTENSIONS } from "./lib/filename"

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
}

const CANONICAL_LANGUAGES_SET = new Set(Object.keys(CODE_LANGUAGE_EXTENSIONS))

function wrapStorageKey(artifactId: string): string {
  return `code-wrap:${artifactId}`
}

export function CodeRenderer({
  artifact,
  hasPreviousVersion,
  previousVersionNum,
  fetchPreviousVersion,
  onRestoreVersion,
}: CodeRendererProps) {
  const isStreaming = artifact.id.startsWith("streaming-")
  const language = artifact.language
  const isCanonicalLanguage =
    !language || CANONICAL_LANGUAGES_SET.has(language.toLowerCase().trim())

  const [mode, setMode] = useState<"source" | "diff">("source")
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
  const diffDisabledReason = isStreaming
    ? "Diff unavailable while artifact is being written"
    : !hasPreviousVersion
    ? "No previous version to compare"
    : undefined

  // Force-reset to source mode if diff becomes unavailable.
  useEffect(() => {
    if (!diffEnabled && mode === "diff") setMode("source")
  }, [diffEnabled, mode])

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

  const handleSearchToggle = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearchQuery("")
        setMatchIndex(0)
      }
      return !prev
    })
  }, [])

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

  const handleDiffToggle = useCallback(() => {
    if (!diffEnabled) return
    setMode((m) => (m === "diff" ? "source" : "diff"))
    if (searchOpen) handleSearchClose()
  }, [diffEnabled, searchOpen, handleSearchClose])

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
      <CodeToolbar
        language={language}
        isCanonicalLanguage={isCanonicalLanguage}
        isStreaming={isStreaming}
        wrap={wrap}
        onWrapToggle={() => setWrap((w) => !w)}
        searchOpen={searchOpen}
        onSearchToggle={handleSearchToggle}
        diffMode={mode === "diff"}
        onDiffToggle={handleDiffToggle}
        diffEnabled={diffEnabled}
        diffDisabledReason={diffDisabledReason}
      />

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

      <div className="flex-1 overflow-auto">
        {mode === "source" ? (
          <CodeSourceView
            content={artifact.content}
            language={language}
            wrap={wrap}
            searchQuery={searchOpen ? searchQuery : ""}
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
    </div>
  )
}
