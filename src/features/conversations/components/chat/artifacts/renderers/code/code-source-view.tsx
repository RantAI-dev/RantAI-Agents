"use client"

import { Component, useState, type ReactNode } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"
import { useTheme } from "next-themes"

interface CodeSourceViewProps {
  content: string
  language: string | undefined
  wrap: boolean
}

/**
 * Normalize the LLM-emitted Shiki canonical language name to whatever
 * Prism (via react-syntax-highlighter) expects. Most names overlap; the
 * handful that diverge are mapped here. Unrecognised names fall through to
 * Prism, which renders plain text rather than throwing.
 */
const PRISM_LANGUAGE_ALIASES: Record<string, string> = {
  shell: "bash",
  dockerfile: "docker",
  cs: "csharp",
  yml: "yaml",
}

function resolveLanguage(input: string | undefined): string {
  if (!input) return "text"
  const lower = input.toLowerCase()
  return PRISM_LANGUAGE_ALIASES[lower] ?? lower
}

export function CodeSourceView({
  content,
  language,
  wrap,
}: CodeSourceViewProps) {
  const { resolvedTheme } = useTheme()
  const style = resolvedTheme === "dark" ? oneDark : oneLight
  const [renderError, setRenderError] = useState<string | null>(null)

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
      data-code-source-wrap={wrap ? "true" : "false"}
      className="h-full overflow-auto"
    >
      <ErrorBoundary onError={(msg) => setRenderError(msg)}>
        <SyntaxHighlighter
          language={resolveLanguage(language)}
          style={style}
          showLineNumbers
          wrapLongLines={wrap}
          customStyle={{
            margin: 0,
            padding: "1rem",
            background: "transparent",
            fontSize: "0.8125rem",
            lineHeight: "1.55",
          }}
          lineNumberStyle={{
            minWidth: "2.25em",
            paddingRight: "0.75em",
            opacity: 0.4,
            userSelect: "none",
          }}
          codeTagProps={{
            style: {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            },
          }}
        >
          {content}
        </SyntaxHighlighter>
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
