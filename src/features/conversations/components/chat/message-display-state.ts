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
  const streamInFlight = input.isLoading && input.isLastMessage
  const bubbleHasOutput = input.content.length > 0
  const showTypingIndicator =
    input.role === "assistant" && streamInFlight && !bubbleHasOutput
  return {
    showTypingIndicator,
    showFooter: !showTypingIndicator,
    showSources: !showTypingIndicator,
  }
}
