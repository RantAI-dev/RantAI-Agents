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
  const { isLoading, isLastMessage, role, content, parts } = input

  if (role !== "assistant") {
    return { showTypingIndicator: false, showFooter: true, showSources: false }
  }

  const hasContent = content.length > 0
  const hasToolInvocation = Array.isArray(parts)
    && parts.some((p) => p?.type === "tool-invocation")

  const streamInFlight = isLoading && isLastMessage
  const bubbleHasOutput = hasContent || hasToolInvocation

  const showTypingIndicator = streamInFlight && !bubbleHasOutput
  const showFooter = !showTypingIndicator
  const showSources = !showTypingIndicator

  return { showTypingIndicator, showFooter, showSources }
}
