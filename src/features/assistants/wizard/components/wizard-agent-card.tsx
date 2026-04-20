"use client"

import { useState, useRef, useEffect } from "react"
import { Sparkles, X } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { WizardDraft, Uncertainty } from "../schema"

interface Props {
  draft: WizardDraft
  uncertainty: Uncertainty
  onUserEdit: <K extends keyof WizardDraft>(field: K, value: WizardDraft[K]) => void
}

const EMOJI_PALETTE = [
  "🤖", "✨", "💼", "🎯", "🚀", "🧠", "💬", "📊",
  "🛠️", "🔍", "📚", "⚡", "🎨", "🌟", "💡", "🎓",
]

export function WizardAgentCard({ draft, uncertainty, onUserEdit }: Props) {
  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editingName) nameRef.current?.focus()
  }, [editingName])
  useEffect(() => {
    if (editingDesc) descRef.current?.focus()
  }, [editingDesc])

  const tags = draft.tags ?? []
  const aiName = uncertainty.name === "ai-suggested"
  const aiDesc = uncertainty.description === "ai-suggested"

  const addTag = () => {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) {
      setTagInput("")
      return
    }
    onUserEdit("tags", [...tags, t])
    setTagInput("")
  }

  return (
    <div className="relative rounded-2xl border bg-gradient-to-br from-primary/[0.03] to-background p-5 shadow-sm">
      <div className="flex gap-4">
        {/* Emoji */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((p) => !p)}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background text-3xl shadow-sm hover:scale-105 transition-transform border"
            aria-label="Change emoji"
          >
            {draft.emoji ?? "🤖"}
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-16 z-20 grid grid-cols-8 gap-1 rounded-xl border bg-background p-2 shadow-lg">
              {EMOJI_PALETTE.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onUserEdit("emoji", e)
                    setPickerOpen(false)
                  }}
                  className="h-7 w-7 rounded text-lg hover:bg-muted"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Name + description */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {editingName ? (
            <input
              ref={nameRef}
              value={draft.name ?? ""}
              onChange={(e) => onUserEdit("name", e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.currentTarget.blur()
                }
              }}
              placeholder="Agent name"
              className="w-full bg-transparent text-lg font-semibold outline-none border-b border-primary/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className={cn(
                "flex w-full items-center gap-1.5 text-left text-lg font-semibold leading-tight",
                "hover:text-primary transition-colors",
                !draft.name && "text-muted-foreground italic"
              )}
            >
              {draft.name || "Untitled agent"}
              {aiName && <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          )}

          {editingDesc ? (
            <textarea
              ref={descRef}
              value={draft.description ?? ""}
              onChange={(e) => onUserEdit("description", e.target.value)}
              onBlur={() => setEditingDesc(false)}
              rows={2}
              placeholder="What does this agent do?"
              className="w-full resize-none bg-transparent text-sm outline-none border-b border-primary/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingDesc(true)}
              className={cn(
                "block w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors",
                !draft.description && "italic"
              )}
            >
              {draft.description || "Add a description…"}
              {aiDesc && (
                <Sparkles className="ml-1 inline h-3 w-3 text-primary" />
              )}
            </button>
          )}

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
              >
                {t}
                <button
                  type="button"
                  onClick={() =>
                    onUserEdit(
                      "tags",
                      tags.filter((x) => x !== t)
                    )
                  }
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove tag ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addTag()
                }
                if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                  onUserEdit("tags", tags.slice(0, -1))
                }
              }}
              onBlur={addTag}
              placeholder={tags.length ? "" : "+ add tag"}
              className="w-20 min-w-[80px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
