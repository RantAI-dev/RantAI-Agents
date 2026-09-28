"use client"

import { useEffect, useRef, useState } from "react"
import { Pencil } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { normalizeSessionTitleInput, SESSION_TITLE_MAX_LENGTH } from "./session-title"

interface EditableSessionTitleProps {
  title: string
  onRename: (title: string) => void
  className?: string
  /** Controlled editing (e.g. a sidebar "Rename" menu item opens it). */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  /** Hide the pencil affordance (the caller provides its own trigger). */
  hideTrigger?: boolean
}

/**
 * Chat title that turns into an input on click / pencil. Enter or blur saves,
 * Escape cancels, an empty or unchanged value is ignored. Persisting (and the
 * rollback + toast on failure) is the caller's job — `updateSession` does it.
 */
export function EditableSessionTitle({
  title,
  onRename,
  className,
  editing: controlledEditing,
  onEditingChange,
  hideTrigger,
}: EditableSessionTitleProps) {
  const [uncontrolledEditing, setUncontrolledEditing] = useState(false)
  const editing = controlledEditing ?? uncontrolledEditing
  const inputRef = useRef<HTMLInputElement>(null)
  // Set once Enter/Escape/blur has settled the edit. Removing the focused
  // input can fire a trailing blur; without this it would commit a draft the
  // user just cancelled (Escape) or save twice (Enter).
  const settledRef = useRef(false)

  const setEditing = (next: boolean) => {
    if (controlledEditing === undefined) setUncontrolledEditing(next)
    onEditingChange?.(next)
  }

  useEffect(() => {
    if (!editing) return
    settledRef.current = false
    // Focus after the input mounts (a closing dropdown may steal it otherwise).
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(raf)
  }, [editing])

  const commit = () => {
    if (settledRef.current) return
    settledRef.current = true
    const next = normalizeSessionTitleInput(inputRef.current?.value ?? "", title)
    if (next) onRename(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label="Chat title"
        defaultValue={title}
        maxLength={SESSION_TITLE_MAX_LENGTH}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            settledRef.current = true
            setEditing(false)
          }
        }}
        onBlur={commit}
        className={cn(
          "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-0.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      />
    )
  }

  return (
    <div className="group/title flex min-w-0 items-center gap-1">
      <button
        type="button"
        className={cn("truncate text-left font-medium", className)}
        title="Rename chat"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {title}
      </button>
      {!hideTrigger && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Rename chat"
          title="Rename chat"
          onClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
