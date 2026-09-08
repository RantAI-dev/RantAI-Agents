import type { TransportToolCallMap } from "./types"
import { applyUiStreamEvent, type TimelinePart } from "../message-timeline"

export interface EmployeePollEvent {
  seq: number
  type: string
  data: Record<string, unknown>
}

export function reduceEmployeePollEvents(params: {
  events: EmployeePollEvent[]
  assistantContent: string
  toolCalls: TransportToolCallMap
  /** Ordered reasoning/text/tool parts; returned updated. */
  timeline?: TimelinePart[]
}): { assistantContent: string; receivedAgentDone: boolean; timeline: TimelinePart[] } {
  let nextAssistantContent = params.assistantContent
  let receivedAgentDone = false
  let timeline = params.timeline ?? []

  for (const evt of params.events) {
    timeline = applyUiStreamEvent(timeline, { ...evt.data, type: evt.type })
    switch (evt.type) {
      case "thinking":
      case "thinking-done":
        break
      case "text-delta":
        nextAssistantContent += (evt.data.delta as string) || ""
        break
      case "tool-input-start":
        params.toolCalls.set(evt.data.toolCallId as string, {
          toolCallId: evt.data.toolCallId as string,
          toolName: evt.data.toolName as string,
          state: "call",
        })
        break
      case "tool-input-available":
        if (params.toolCalls.has(evt.data.toolCallId as string)) {
          const tc = params.toolCalls.get(evt.data.toolCallId as string)!
          tc.args = evt.data.input as Record<string, unknown>
          tc.state = "call"
        }
        break
      case "tool-output-available": {
        const tc = params.toolCalls.get(evt.data.toolCallId as string)
        if (tc) {
          tc.output = evt.data.output
          tc.state = "result"
        }
        break
      }
      case "tool-output-error": {
        const tc = params.toolCalls.get(evt.data.toolCallId as string)
        if (tc) {
          tc.errorText = evt.data.errorText as string
          tc.state = "error"
        }
        break
      }
      case "error":
        nextAssistantContent += `Error: ${evt.data.message}`
        timeline = applyUiStreamEvent(timeline, { type: "text-delta", delta: `Error: ${evt.data.message}` })
        break
      case "agent-done":
        receivedAgentDone = true
        break
    }
  }

  return { assistantContent: nextAssistantContent, receivedAgentDone, timeline }
}
