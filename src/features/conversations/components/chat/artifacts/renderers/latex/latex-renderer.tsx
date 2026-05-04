"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import { AlertTriangle, Code, RotateCcw } from "@/lib/icons"
import { LatexPaperView } from "./latex-paper-view"
import { LatexSourceView } from "./latex-source-view"
import { LatexToolbar } from "./latex-toolbar"
import { latexToHtml } from "./lib/transpiler"
import { scanLabels } from "./lib/cross-refs"

interface LatexRendererProps {
  content: string
}

export function LatexRenderer({ content }: LatexRendererProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "source">("preview")
  const [retryCount, setRetryCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { html, error } = useMemo(() => {
    try {
      const registry = scanLabels(content)
      const { html } = latexToHtml(content, registry)
      return { html, error: null as string | null }
    } catch (err) {
      return {
        html: null,
        error: err instanceof Error ? err.message : "Failed to render LaTeX",
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, retryCount])

  const handleRetry = useCallback(() => setRetryCount((c) => c + 1), [])

  const handleCopy = useCallback(async () => {
    const text =
      activeTab === "preview"
        ? containerRef.current?.querySelector("article")?.textContent ?? ""
        : content
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write can fail in restrictive contexts; swallow silently.
    }
  }, [activeTab, content])

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
    <div ref={containerRef} className="flex flex-col h-full">
      <LatexToolbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onCopy={handleCopy}
        copied={copied}
      />
      <div className="flex-1 min-h-0">
        {activeTab === "preview" ? (
          <LatexPaperView html={html ?? ""} />
        ) : (
          <LatexSourceView source={content} />
        )}
      </div>
    </div>
  )
}
