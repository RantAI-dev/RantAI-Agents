"use client"

import CodeMirror from "@uiw/react-codemirror"
import { python } from "@codemirror/lang-python"
import { oneDark } from "@codemirror/theme-one-dark"
import { keymap, EditorView } from "@codemirror/view"
import { useTheme } from "next-themes"
import { useMemo } from "react"

interface Props {
  value: string
  onChange: (next: string) => void
  onRun: () => void
  onRunAndAdvance?: () => void
  readOnly?: boolean
  autoFocus?: boolean
}

export function CodeCellEditor({ value, onChange, onRun, onRunAndAdvance, readOnly, autoFocus }: Props) {
  const { resolvedTheme } = useTheme()
  const extensions = useMemo(
    () => [
      python(),
      EditorView.lineWrapping,
      keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            onRun()
            return true
          },
        },
        {
          key: "Shift-Enter",
          preventDefault: true,
          run: () => {
            ;(onRunAndAdvance ?? onRun)()
            return true
          },
        },
      ]),
    ],
    [onRun, onRunAndAdvance],
  )

  return (
    <CodeMirror
      value={value}
      height="auto"
      minHeight="2rem"
      theme={resolvedTheme === "dark" ? oneDark : "light"}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      autoFocus={autoFocus}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        bracketMatching: true,
        autocompletion: false,
      }}
      className="text-sm"
    />
  )
}
