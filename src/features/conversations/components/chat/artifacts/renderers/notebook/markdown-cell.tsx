"use client"

import { useEffect, useRef, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { markdown } from "@codemirror/lang-markdown"
import { EditorView } from "@codemirror/view"
import { oneDark } from "@codemirror/theme-one-dark"
import { useTheme } from "next-themes"
import { StreamdownContent } from "../../../streamdown-content"

interface Props {
  source: string
  onChange: (next: string) => void
}

export function MarkdownCell({ source, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!editing) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setEditing(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [editing])

  if (editing) {
    return (
      <div ref={containerRef} className="px-4 py-2">
        <CodeMirror
          value={source}
          height="auto"
          minHeight="2rem"
          theme={resolvedTheme === "dark" ? oneDark : "light"}
          extensions={[markdown(), EditorView.lineWrapping]}
          onChange={onChange}
          autoFocus
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
          className="text-sm"
        />
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setEditing(true)
      }}
      className="px-4 py-2 cursor-text hover:bg-muted/30 rounded"
    >
      {source.trim().length > 0 ? (
        <StreamdownContent content={source} />
      ) : (
        <span className="text-xs text-muted-foreground italic">Empty markdown cell — click to edit</span>
      )}
    </div>
  )
}
