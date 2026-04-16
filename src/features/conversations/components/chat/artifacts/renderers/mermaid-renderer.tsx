"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Loader2, AlertTriangle, RotateCcw, Code, Wand2 } from "@/lib/icons"
import { useTheme } from "next-themes"
import { getMermaidConfig } from "./mermaid-config"

interface MermaidRendererProps {
  content: string
  /** Callback to send a diagram error to the LLM for automated repair. */
  onFixWithAI?: (error: string) => void
}

/**
 * Hoist mermaid loading and `initialize()` to module scope so we
 * pay the dynamic-import cost once and re-initialize ONLY when the theme
 * actually changes — not on every render. The `lastInitTheme` cache prevents
 * redundant re-init calls when content updates but the theme stayed put.
 */
type MermaidModule = typeof import("mermaid").default
let mermaidPromise: Promise<MermaidModule> | null = null
let lastInitTheme: "dark" | "default" | null = null

async function getMermaid(theme: "dark" | "default"): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default)
  }
  const mermaid = await mermaidPromise
  if (lastInitTheme !== theme) {
    mermaid.initialize(getMermaidConfig(theme))
    lastInitTheme = theme
  }
  return mermaid
}

export function MermaidRenderer({ content, onFixWithAI }: MermaidRendererProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSource, setShowSource] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(`mermaid-${crypto.randomUUID().slice(0, 8)}`)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      try {
        setLoading(true)
        setError(null)

        const theme = resolvedTheme === "dark" ? "dark" : "default"
        const mermaid = await getMermaid(theme)

        // Generate a fresh ID for each render attempt to avoid DOM conflicts
        idRef.current = `mermaid-${crypto.randomUUID().slice(0, 8)}`

        // Validate syntax first
        const isValid = await mermaid.parse(content, { suppressErrors: true })
        if (!isValid) {
          if (!cancelled) {
            setError("Invalid diagram syntax. Check the source for errors.")
            setLoading(false)
          }
          return
        }

        const { svg: renderedSvg } = await mermaid.render(
          idRef.current,
          content
        )

        if (!cancelled) {
          setSvg(renderedSvg)
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to render diagram"
          // Clean up mermaid's verbose error messages
          setError(message.replace(/\n\n[\s\S]*$/, ""))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    renderDiagram()
    return () => {
      cancelled = true
    }
  }, [content, resolvedTheme, retryCount])

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Rendering diagram...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2 text-amber-500 min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">
                Diagram could not be rendered
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onFixWithAI && error && (
                <button
                  type="button"
                  onClick={() => onFixWithAI(error)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Fix with AI
                </button>
              )}
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
      ref={containerRef}
      className="flex items-center justify-center p-4 overflow-auto min-h-[200px] [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:rounded-md"
      dangerouslySetInnerHTML={{ __html: svg || "" }}
    />
  )
}
