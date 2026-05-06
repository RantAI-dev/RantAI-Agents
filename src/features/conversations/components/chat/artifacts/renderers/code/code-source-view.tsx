"use client"

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { useTheme } from "next-themes"
import {
  applyHighlights,
  clearHighlights,
  findMatches,
  type HighlightMode,
} from "./lib/search"

interface CodeSourceViewProps {
  content: string
  language: string | undefined
  wrap: boolean
  /** When non-empty, drives the search-highlight effect. */
  searchQuery: string
  /** Index of the "current" match (the one the user is focused on, e.g. via prev/next nav).
   *  The current match gets a brighter highlight class and is scrolled into view. */
  currentMatchIndex?: number
}

function adaptiveFence(content: string): string {
  const longestRun = (content.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0,
  )
  return "`".repeat(Math.max(3, longestRun + 1))
}

export function CodeSourceView({
  content,
  language,
  wrap,
  searchQuery,
  currentMatchIndex,
}: CodeSourceViewProps) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightModeRef = useRef<HighlightMode | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  const fenced = useMemo(() => {
    const fence = adaptiveFence(content)
    return `${fence}${language ?? ""}\n${content}\n${fence}`
  }, [content, language])

  // Apply / re-apply highlights whenever the search query, current-match, or content changes.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    // Tear down any existing highlights first.
    clearHighlights(root, highlightModeRef.current)
    highlightModeRef.current = null

    if (!searchQuery || !content) return

    // Defer one frame so Streamdown has finished painting.
    const id = window.requestAnimationFrame(() => {
      const matches = findMatches(content, searchQuery)
      const result = applyHighlights(root, matches, content, currentMatchIndex)
      highlightModeRef.current = result?.mode ?? null

      // Scroll the current match into view. The Range's startContainer is a
      // text node; its parentElement is the inline span Shiki rendered for
      // that token, which is what we can scrollIntoView.
      if (result?.currentRange) {
        const target = result.currentRange.startContainer.parentElement
        if (target && typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }
    })
    return () => {
      window.cancelAnimationFrame(id)
      if (root) clearHighlights(root, highlightModeRef.current)
      highlightModeRef.current = null
    }
  }, [searchQuery, content, currentMatchIndex])

  if (!content) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        No content yet.
      </div>
    )
  }

  if (renderError) {
    return (
      <pre className="font-mono text-xs whitespace-pre-wrap p-4 overflow-auto">
        {content}
      </pre>
    )
  }

  return (
    <div
      ref={containerRef}
      data-code-source-wrap={wrap ? "true" : "false"}
      className={
        wrap
          ? "[&_pre]:whitespace-pre-wrap [&_pre]:break-words"
          : "[&_pre]:whitespace-pre [&_pre]:overflow-x-auto"
      }
    >
      <ErrorBoundary onError={(msg) => setRenderError(msg)}>
        <Streamdown
          shikiTheme={
            resolvedTheme === "dark"
              ? ["github-dark", "github-light"]
              : ["github-light", "github-dark"]
          }
          controls={{ code: false }}
        >
          {fenced}
        </Streamdown>
      </ErrorBoundary>
    </div>
  )
}

class ErrorBoundary extends Component<
  { children: ReactNode; onError: (msg: string) => void },
  { errored: boolean }
> {
  state = { errored: false }
  static getDerivedStateFromError() {
    return { errored: true }
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message)
  }
  render() {
    if (this.state.errored) return null
    return this.props.children
  }
}
