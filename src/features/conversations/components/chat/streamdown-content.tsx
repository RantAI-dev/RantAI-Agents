"use client"

import { Component, useState, type ErrorInfo, type ReactNode } from "react"
import { Streamdown } from "streamdown"
import type { MermaidErrorComponentProps } from "streamdown"
import "streamdown/styles.css"
import "katex/dist/katex.min.css"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { useTheme } from "next-themes"
import { AlertTriangle, RotateCcw, Code } from "@/lib/icons"

// Error boundary specifically for Streamdown render failures. Streamdown
// parses markdown + KaTeX + Mermaid + Shiki on every render; a malformed
// fragment streaming mid-message (broken LaTeX, unclosed code fence with
// invalid lang, mid-token markdown) can throw inside one of those parsers
// and tear down the entire message bubble — the user sees their reply
// vanish. Falling back to <pre> preserves the content as plain text so
// at minimum nothing is lost while the user retries or refreshes.
interface StreamdownBoundaryProps {
  content: string
  children: ReactNode
}
interface StreamdownBoundaryState {
  hasError: boolean
}
class StreamdownErrorBoundary extends Component<
  StreamdownBoundaryProps,
  StreamdownBoundaryState
> {
  state: StreamdownBoundaryState = { hasError: false }

  static getDerivedStateFromError(): StreamdownBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log so the failure is observable; the user-facing fallback below
    // keeps the message readable regardless.
    console.error("Streamdown render failed:", error, info)
  }

  // Recover when the content changes (next chunk arrives or final flush)
  // — if the malformed fragment was mid-stream, the completed message may
  // parse fine. Without this the bubble stays in fallback for the rest
  // of its lifetime.
  componentDidUpdate(prevProps: StreamdownBoundaryProps) {
    if (this.state.hasError && prevProps.content !== this.props.content) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="flex items-center gap-2 text-amber-500 mb-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium">
              Showing as plain text — markdown render failed
            </span>
          </div>
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono overflow-x-auto">
            {this.props.content}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

function MermaidError({ error, chart, retry }: MermaidErrorComponentProps) {
  const [showSource, setShowSource] = useState(false)

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 text-amber-500 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium truncate">
            Diagram could not be rendered
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <Code className="h-3 w-3" />
            {showSource ? "Hide" : "Source"}
          </button>
        </div>
      </div>
      {showSource && (
        <pre className="px-3 py-2 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap font-mono">
          {chart}
        </pre>
      )}
      <div className="px-3 py-1.5 border-t border-amber-500/20 text-[11px] text-amber-500/70 truncate">
        {error}
      </div>
    </div>
  )
}

interface StreamdownContentProps {
  content: string
  isStreaming?: boolean
  className?: string
}

export function StreamdownContent({
  content,
  isStreaming,
  className,
}: StreamdownContentProps) {
  const { resolvedTheme } = useTheme()

  return (
    <div className={className ?? "chat-message max-w-none"}>
      <StreamdownErrorBoundary content={content}>
        <Streamdown
          animated={{ animation: "fadeIn", sep: "char", duration: 180 }}
          isAnimating={isStreaming}
          caret={isStreaming ? "block" : undefined}
          shikiTheme={
            resolvedTheme === "dark"
              ? ["github-dark", "github-light"]
              : ["github-light", "github-dark"]
          }
          controls={{ code: true, table: true, mermaid: true }}
          mermaid={{ errorComponent: MermaidError }}
          plugins={{
            math: {
              name: "katex",
              type: "math",
              remarkPlugin: remarkMath,
              rehypePlugin: rehypeKatex,
            },
          }}
        >
          {content}
        </Streamdown>
      </StreamdownErrorBoundary>
    </div>
  )
}
