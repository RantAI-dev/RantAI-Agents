export interface TransportToolCall {
  toolCallId: string
  toolName: string
  state: string
  args?: Record<string, unknown>
  output?: unknown
  errorText?: string
}

export type TransportToolCallMap = Map<string, TransportToolCall>
