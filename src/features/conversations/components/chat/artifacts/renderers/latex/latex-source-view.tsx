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
    <div className="bg-muted/30 dark:bg-zinc-900 min-h-full p-8 overflow-auto">
      <div
        className={[
          "mx-auto max-w-[720px]",
          "bg-white dark:bg-zinc-800",
          "rounded-md shadow-lg",
          "overflow-hidden",
        ].join(" ")}
      >
        <SyntaxHighlighter
          language="latex"
          style={style}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: "1.5rem",
            background: "transparent",
            fontSize: "0.875rem",
            lineHeight: "1.5",
          }}
        >
          {source}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
