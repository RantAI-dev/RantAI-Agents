"use client"

import { useState, useCallback } from "react"
import { Streamdown } from "streamdown"
import type { MermaidErrorComponentProps } from "streamdown"
import "streamdown/styles.css"
import "katex/dist/katex.min.css"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { useTheme } from "next-themes"
import { AlertTriangle, RotateCcw, Code } from "lucide-react"

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
      <Streamdown
        animated
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
    </div>
  )
}
