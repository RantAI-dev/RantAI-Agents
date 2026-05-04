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
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <SyntaxHighlighter
          language="latex"
          style={style}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: "1rem",
            background: "transparent",
            fontSize: "0.8125rem",
            lineHeight: "1.6",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.5rem",
          }}
        >
          {source}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
