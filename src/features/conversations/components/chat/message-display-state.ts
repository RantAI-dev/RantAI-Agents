export type ToolInvocationStateLike =
  | "input-streaming"
  | "input-available"
  | "execution-started"
  | "call"
  | "partial-call"
  | "result"
  | "done"
  | "error"

export interface MessageDisplayInput {
  isLoading: boolean
  isLastMessage: boolean
  role: string
  content: string
  parts?: Array<{ type?: string; state?: string; text?: string }>
  metadata?: { reasoning?: unknown }
}

export interface MessageDisplayState {
  showTypingIndicator: boolean
  showFooter: boolean
  showSources: boolean
}

export function getMessageDisplayState(
  input: MessageDisplayInput
): MessageDisplayState {
  const { isLoading, isLastMessage, role, content, parts, metadata } = input

  if (role !== "assistant") {
    return { showTypingIndicator: false, showFooter: true, showSources: false }
  }

  // Visible text, not raw length: a first delta of "\n", "**" or "- " renders
  // as an empty bubble (just the caret), so keep the typing indicator up
  // until something readable arrives (QA TC-783).
  const hasContent = hasVisibleStreamingText(content)
  const reasoning =
    typeof metadata?.reasoning === "string" ? metadata.reasoning : ""
  const hasReasoning = reasoning.length > 0
  const hasToolInvocation = Array.isArray(parts)
    && parts.some((p) => p?.type === "tool-invocation")

  const streamInFlight = isLoading && isLastMessage
  const bubbleHasOutput = hasContent || hasReasoning || hasToolInvocation

  const showTypingIndicator = streamInFlight && !bubbleHasOutput
  const showFooter = !showTypingIndicator
  const showSources = !showTypingIndicator

  return { showTypingIndicator, showFooter, showSources }
}

/**
 * True once markdown has something a reader can see. Whitespace and bare
 * markdown syntax (heading hashes, emphasis markers, list bullets, fences,
 * table pipes) do not count — they render as nothing mid-stream.
 */
export function hasVisibleStreamingText(markdown: string): boolean {
  if (!markdown) return false
  const stripped = markdown
    // Ordered-list markers ("1." / "2)") at line start.
    .replace(/^\s*\d+[.)](?=\s|$)/gm, "")
    .replace(/[\s#*_`~>|=:+\-]/g, "")
  return stripped.length > 0
}

/** The block caret shows only while streaming AND once text is visible. */
export function shouldShowStreamingCaret(
  isStreaming: boolean | undefined,
  renderedContent: string,
): boolean {
  return Boolean(isStreaming) && hasVisibleStreamingText(renderedContent)
}

/**
 * Streamdown's animate plugin defaults to a 40ms per-character *stagger*:
 * every character it considers "new" in a render is delayed by its index ×
 * 40ms. Its bookkeeping of what is new is approximate (it resets whenever a
 * block re-renders without re-running the rehype pass), so after a structural
 * change — e.g. `**bold` turning into a <strong> node — whole runs of text
 * restart at opacity 0 with multi-second delays. Bold segments then look empty
 * until the stream ends and animation is switched off (QA TC-783). The
 * typewriter in markdown-content already paces characters, so no stagger is
 * needed; word-level spans also mean far fewer nodes to re-create.
 */
export const STREAMDOWN_ANIMATION = {
  animation: "fadeIn",
  sep: "word",
  duration: 180,
  stagger: 0,
} as const
