"use client"

import { Component, useMemo, useState, type ReactNode } from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { useTheme } from "next-themes"

interface CodeSourceViewProps {
  content: string
  language: string | undefined
  wrap: boolean
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
}: CodeSourceViewProps) {
  const { resolvedTheme } = useTheme()
  const [renderError, setRenderError] = useState<string | null>(null)

  const fenced = useMemo(() => {
    const fence = adaptiveFence(content)
    return `${fence}${language ?? ""}\n${content}\n${fence}`
  }, [content, language])

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
