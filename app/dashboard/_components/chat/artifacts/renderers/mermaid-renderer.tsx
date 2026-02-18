"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Loader2, AlertTriangle, RotateCcw, Code } from "lucide-react"
import { useTheme } from "next-themes"

interface MermaidRendererProps {
  content: string
}

export function MermaidRenderer({ content }: MermaidRendererProps) {
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

        const mermaid = (await import("mermaid")).default

        // Generate a fresh ID for each render attempt to avoid DOM conflicts
        idRef.current = `mermaid-${crypto.randomUUID().slice(0, 8)}`

        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "system-ui, -apple-system, sans-serif",
        })

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
      className="flex items-center justify-center p-4 overflow-auto [&>svg]:max-w-full [&>svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg || "" }}
    />
  )
}
