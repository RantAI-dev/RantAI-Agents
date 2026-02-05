"use client"

import { memo, useState } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Check, Copy } from "lucide-react"

interface CodeBlockProps {
  language?: string
  children: string
}

export const CodeBlock = memo<CodeBlockProps>(({ language, children }) => {
  const { resolvedTheme } = useTheme()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isDark = resolvedTheme === "dark"

  return (
    <div className="relative group rounded-lg overflow-hidden my-3 border">
      {/* Header with language label */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          {language || "text"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1 text-chart-2" />
              <span className="text-chart-2">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={language || "text"}
        style={isDark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          padding: "1rem",
          fontSize: "0.85rem",
          background: isDark ? "#1e1e1e" : "#fafafa",
        }}
        showLineNumbers={children.split("\n").length > 3}
        lineNumberStyle={{
          minWidth: "2.5em",
          paddingRight: "1em",
          color: isDark ? "#606060" : "#999",
          userSelect: "none",
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
})

CodeBlock.displayName = "CodeBlock"
