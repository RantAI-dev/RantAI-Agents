"use client"

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"
import { useTheme } from "next-themes"

interface LatexSourceViewProps {
  source: string
}

export function LatexSourceView({ source }: LatexSourceViewProps) {
  const { resolvedTheme } = useTheme()
  const style = resolvedTheme === "dark" ? oneDark : oneLight

  return (
    <div className="flex-1 overflow-auto bg-muted/40 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl bg-background border border-border/60 shadow-sm rounded-md overflow-hidden">
        <SyntaxHighlighter
          language="latex"
          style={style}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: "1.25rem",
            background: "transparent",
            fontSize: "0.8125rem",
            lineHeight: "1.6",
          }}
        >
          {source}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
