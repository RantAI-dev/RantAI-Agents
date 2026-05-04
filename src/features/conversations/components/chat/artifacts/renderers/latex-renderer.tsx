"use client"

import { useState, useMemo, useCallback } from "react"
import { AlertTriangle, RotateCcw, Code } from "@/lib/icons"
import "katex/dist/katex.min.css"
import { latexToHtml } from "./latex/lib/transpiler"

interface LatexRendererProps {
  content: string
}

export function LatexRenderer({ content }: LatexRendererProps) {
  const [showSource, setShowSource] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const { html, error } = useMemo(() => {
    try {
      const { html } = latexToHtml(content, new Map())
      return { html, error: null }
    } catch (err) {
      return {
        html: null,
        error: err instanceof Error ? err.message : "Failed to render LaTeX",
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, retryCount])

  const handleRetry = useCallback(() => setRetryCount((c) => c + 1), [])

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2 text-amber-500 min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">LaTeX render error</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <Code className="h-3.5 w-3.5" />
                {showSource ? "Hide source" : "View source"}
              </button>
            </div>
          </div>
          <div className="px-3 py-2 border-t border-amber-500/20 text-xs text-amber-500/80">
            {error}
          </div>
          {showSource && (
            <pre className="px-3 py-3 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap font-mono bg-muted/30">
              {content}
            </pre>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-6 prose dark:prose-invert max-w-none overflow-auto [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2 [&_.math-block]:my-4 [&_.doc-title]:text-2xl [&_.doc-title]:font-bold [&_.doc-title]:mb-2 [&_.doc-author]:text-muted-foreground [&_.doc-author]:mb-1 [&_.doc-date]:text-muted-foreground [&_.doc-date]:text-sm [&_.doc-date]:mb-4 [&_.latex-error]:text-red-500 [&_.latex-error]:text-xs"
      dangerouslySetInnerHTML={{ __html: html || "" }}
    />
  )
}
