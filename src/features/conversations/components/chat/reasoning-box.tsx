"use client"

import { useEffect, useState } from "react"
import {
  Brain,
  ChevronDown,
  ChevronRight,
} from "@/lib/icons"
import { cn } from "@/lib/utils"

interface ReasoningBoxProps {
  content: string
  isStreaming: boolean
  durationMs?: number | null
}

/**
 * Collapsible "Thinking" disclosure rendered above an assistant message.
 * Shows live chain-of-thought from reasoning models (MiniMax-M2 `<think>`,
 * Claude extended thinking, DeepSeek R1, o1-style, etc.). The content is
 * driven by the assistant message's `metadata.reasoning`, accumulated
 * during the stream from `reasoning-delta` SSE parts.
 *
 * Defaults: expanded while streaming so the user can watch the model
 * think; collapsed once streaming ends (the answer is what they came for).
 */
// OpenRouter's provider emits the literal string "[REDACTED]" when the model
// returned encrypted reasoning blocks (OpenAI o-series, certain Anthropic
// thinking configurations). The actual chain-of-thought is signed/encrypted
// on the provider side and can't be exposed to clients — only the fact that
// reasoning happened is visible. See @openrouter/ai-sdk-provider's
// reasoning.encrypted branch (dist/index.mjs:3196, :3489).
const REDACTED_TOKEN_PATTERN = /\[REDACTED\]/g

export function ReasoningBox({ content, isStreaming, durationMs }: ReasoningBoxProps) {
  const [expanded, setExpanded] = useState(isStreaming)

  // Auto-collapse once streaming finishes. Subsequent user toggles win.
  const [userTouched, setUserTouched] = useState(false)
  useEffect(() => {
    if (!isStreaming && !userTouched) setExpanded(false)
  }, [isStreaming, userTouched])

  if (!content) return null

  // Strip "[REDACTED]" markers out of the visible content regardless of
  // where they appear. Drop the literal token, then collapse the runs of
  // whitespace it leaves behind so the surrounding text doesn't end up
  // with stranded blank lines / double spaces. If nothing meaningful is
  // left after stripping, the model gave us only encrypted reasoning —
  // we know it thought, but the content itself is hidden by the provider,
  // so swap the body to a brief explanation rather than leaking "[REDACTED]"
  // into the UI (reads as a bug to users).
  const stripped = content
    .replace(REDACTED_TOKEN_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  const hadRedactedMarker = content.includes("[REDACTED]")
  const isOnlyRedacted = hadRedactedMarker && stripped.length === 0
  const displayContent = isOnlyRedacted
    ? "This model encrypts its chain-of-thought. The reasoning happened on the provider side but the content is hidden by the model."
    : stripped

  const seconds = durationMs != null ? Math.max(1, Math.round(durationMs / 1000)) : null
  const headerLabel = isStreaming
    ? "Thinking…"
    : isOnlyRedacted
    ? "Reasoned privately"
    : seconds != null
    ? `Thought for ${seconds}s`
    : "Reasoning"

  return (
    <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 text-sm">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse reasoning" : "Expand reasoning"}
        onClick={() => {
          setUserTouched(true)
          setExpanded((v) => !v)
        }}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left",
          "text-muted-foreground hover:text-foreground transition-colors",
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <Brain
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isStreaming && "animate-pulse text-primary",
          )}
        />
        <span className="font-medium">{headerLabel}</span>
      </button>
      {expanded && (
        <div
          className={cn(
            "border-t border-border/60 px-3 py-2",
            "whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground",
            "max-h-72 overflow-y-auto",
            isOnlyRedacted && "italic",
          )}
        >
          {displayContent}
        </div>
      )}
    </div>
  )
}
