import { orchestrator } from "@/lib/digital-employee"
import {
  createChatMessage,
  createEmployeeRun,
  findChatMessagesByEmployeeId,
  findEmployeeForChat,
  findEmployeeGroupById,
  findRecentChatMessagesByEmployeeId,
  updateEmployeeRun,
} from "./repository"
import type { ChatMessageInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface ChatAccessContext {
  organizationId: string | null
}

export interface ChatEvent {
  seq: number
  type: string
  data: Record<string, unknown>
}

export interface ChatEventPollResponse {
  events: ChatEvent[]
  done: boolean
  error?: string
  nextSeq?: number
}

interface ParsedToolCall {
  toolCallId: string
  toolName: string
  input: unknown
  output?: string
}

interface ChatEventBuffer {
  events: ChatEvent[]
  done: boolean
  error?: string
  createdAt: number
}

const chatEventBuffers = new Map<string, ChatEventBuffer>()
const cleanupTimer = globalThis.setInterval(() => {
  const now = Date.now()
  for (const [key, buffer] of chatEventBuffers) {
    if (now - buffer.createdAt > 10 * 60 * 1000) {
      chatEventBuffers.delete(key)
    }
  }
}, 5 * 60 * 1000)

if (typeof cleanupTimer === "object" && cleanupTimer && "unref" in cleanupTimer) {
  ;(cleanupTimer as { unref: () => void }).unref()
}

function pushEvent(messageId: string, type: string, data: Record<string, unknown>) {
  const buffer = chatEventBuffers.get(messageId)
  if (!buffer) return
  buffer.events.push({ seq: buffer.events.length, type, data })
}

/**
 * Extract structured tool calls from a gateway response payload.
 */
export function extractToolCalls(data: Record<string, unknown>): ParsedToolCall[] {
  for (const key of ["tool_calls", "toolCalls"]) {
    const value = data[key]
    if (Array.isArray(value) && value.length > 0) {
      return value.map((item, index) => {
        const candidate = item as Record<string, unknown>
        return {
          toolCallId: (candidate.toolCallId || candidate.tool_call_id || `tc_${index}`) as string,
          toolName: (candidate.toolName || candidate.tool_name || candidate.name || "unknown") as string,
          input: candidate.input || candidate.arguments || candidate.args || {},
          output:
            candidate.output != null
              ? typeof candidate.output === "string"
                ? candidate.output
                : JSON.stringify(candidate.output)
              : "completed",
        }
      })
    }
  }

  return []
}

/**
 * Extracts the display text from a gateway response payload.
 */
export function extractResponseText(data: Record<string, unknown>): string {
  for (const key of ["response", "text", "message", "content", "output"]) {
    const value = data[key]
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  return ""
}

/**
 * Rewrites localhost OAuth URLs so the browser can reach them through the app.
 */
export function rewriteOAuthUrls(text: string, employeeId: string): string {
  const basePath = `/api/dashboard/digital-employees/${employeeId}/oauth-proxy`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  text = text.replace(
    /redirect_uri=(https?(?:%3A%2F%2F|:\/\/)(?:127\.0\.0\.1|localhost)(?:%3A|:)(\d+)((?:%2F|\/)[^\s&"'<>]*))/gi,
    (_match, _fullUrl, _port, encodedPath) => {
      const path = decodeURIComponent(encodedPath)
      const newRedirect = `${appUrl}${basePath}/direct${path}`
      return `redirect_uri=${encodeURIComponent(newRedirect)}`
    }
  )

  text = text.replace(
    /https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)(\/[^\s"'<>;&]*)/g,
    (_match, _port, path) => `${basePath}/direct${path}`
  )

  return text
}

function buildConversationContextMessage(
  history: Array<{ role: string; content: string }>,
  userMessage: string
) {
  if (history.length === 0) {
    return userMessage
  }

  const historyBlock = history
    .map((message) => `[${message.role === "user" ? "User" : "You"}]: ${message.content}`)
    .join("\n\n")

  return `<conversation_history>\n${historyBlock}\n</conversation_history>\n\n[User]: ${userMessage}`
}

async function processGatewayRequest(params: {
  messageId: string
  employeeId: string
  containerUrl: string
  gatewayToken: string
  contextMessage: string
  agentIdHeader?: string
}) {
  const buffer = chatEventBuffers.get(params.messageId)
  if (!buffer) return

  const startTime = Date.now()
  const run = await createEmployeeRun({
    digitalEmployeeId: params.employeeId,
    trigger: "manual",
    status: "RUNNING",
  })

  try {
    let useStreaming = true
    let gatewayResponse: Response

    const MAX_RETRIES = 5
    const RETRY_DELAY_MS = 3000

    async function attemptGatewayCall(): Promise<Response> {
      try {
        const response = await fetch(`${params.containerUrl}/webhook/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${params.gatewayToken}`,
            ...(params.agentIdHeader ? { "X-Agent-Id": params.agentIdHeader } : {}),
          },
          body: JSON.stringify({ message: params.contextMessage }),
          signal: AbortSignal.timeout(600_000),
        })
        if (response.status !== 404) return response
      } catch {
        // Fall through to JSON webhook handling.
      }

      useStreaming = false
      return fetch(`${params.containerUrl}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.gatewayToken}`,
          ...(params.agentIdHeader ? { "X-Agent-Id": params.agentIdHeader } : {}),
        },
        body: JSON.stringify({ message: params.contextMessage }),
        signal: AbortSignal.timeout(600_000),
      })
    }

    async function callWithRetry(): Promise<Response> {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          return await attemptGatewayCall()
        } catch (error) {
          const isConnectionError =
            error instanceof Error &&
            (error.message.includes("ConnectionRefused") ||
              error.message.includes("ECONNREFUSED") ||
              error.message.includes("Unable to connect") ||
              String((error as { cause?: unknown }).cause).includes("ECONNREFUSED"))
          if (!isConnectionError || attempt === MAX_RETRIES - 1) {
            throw error
          }

          console.warn(
            `Gateway connection attempt ${attempt + 1}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS}ms...`
          )
          pushEvent(params.messageId, "thinking", {})
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }

      throw new Error("Gateway connection failed after retries")
    }

    gatewayResponse = await callWithRetry()

    if (!gatewayResponse.ok) {
      const errText = await gatewayResponse.text()
      console.error("RantaiClaw gateway error:", gatewayResponse.status, errText)
      pushEvent(params.messageId, "error", {
        message: `Gateway returned ${gatewayResponse.status}. The employee may have timed out while processing.`,
      })
      buffer.done = true
      return
    }

    const contentType = gatewayResponse.headers.get("content-type") || ""
    const isSSE = useStreaming && contentType.includes("text/event-stream")

    if (isSSE && gatewayResponse.body) {
      let assistantContent = ""
      const toolCalls: ParsedToolCall[] = []
      let agentDone = false

      const reader = gatewayResponse.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split("\n")
        sseBuffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (!payload || payload === "[DONE]") continue

          let event: Record<string, unknown>
          try {
            event = JSON.parse(payload)
          } catch {
            continue
          }

          switch (event.type as string) {
            case "thinking":
              pushEvent(params.messageId, "thinking", {})
              break

            case "thinking-done":
              pushEvent(params.messageId, "thinking-done", {})
              break

            case "tool-start":
              pushEvent(params.messageId, "tool-input-start", {
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              })
              if (event.input != null) {
                pushEvent(params.messageId, "tool-input-available", {
                  toolCallId: event.toolCallId,
                  input: event.input,
                })
              }
              toolCalls.push({
                toolCallId: (event.toolCallId as string) || "",
                toolName: (event.toolName as string) || "unknown",
                input: event.input || {},
              })
              break

            case "tool-done": {
              pushEvent(params.messageId, "tool-output-available", {
                toolCallId: event.toolCallId,
                output: event.output,
              })
              const toolCall = toolCalls.find((item) => item.toolCallId === event.toolCallId)
              if (toolCall) toolCall.output = (event.output as string) || "completed"
              break
            }

            case "tool-error":
              pushEvent(params.messageId, "tool-output-error", {
                toolCallId: event.toolCallId,
                errorText: event.error,
              })
              break

            case "text-delta":
              if (typeof event.delta === "string") {
                const delta = rewriteOAuthUrls(event.delta, params.employeeId)
                assistantContent += delta
                pushEvent(params.messageId, "text-delta", { delta })
              }
              break

            case "error":
              pushEvent(params.messageId, "error", { message: event.message })
              break

            case "agent-done":
              agentDone = true
              break
          }
        }

        if (agentDone) break
      }

      reader.cancel().catch(() => {})

      const content = assistantContent || "Task completed."
      await createChatMessage({
        digitalEmployeeId: params.employeeId,
        role: "assistant",
        content,
        toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
      })
    } else {
      const gatewayData = await gatewayResponse.json()
      const displayText = extractResponseText(gatewayData) || "Task completed."
      const toolCalls = extractToolCalls(gatewayData)

      await createChatMessage({
        digitalEmployeeId: params.employeeId,
        role: "assistant",
        content: displayText,
        toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
      })

      for (const toolCall of toolCalls) {
        pushEvent(params.messageId, "tool-input-start", {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
        })
        pushEvent(params.messageId, "tool-input-available", {
          toolCallId: toolCall.toolCallId,
          input: toolCall.input,
        })
        if (toolCall.output !== undefined) {
          pushEvent(params.messageId, "tool-output-available", {
            toolCallId: toolCall.toolCallId,
            output: toolCall.output,
          })
        }
      }

      if (displayText) {
        const chunkSize = 100
        for (let index = 0; index < displayText.length; index += chunkSize) {
          pushEvent(params.messageId, "text-delta", {
            delta: displayText.slice(index, index + chunkSize),
          })
        }
      }
    }

    pushEvent(params.messageId, "agent-done", {})

    await updateEmployeeRun(run.id, {
      status: "COMPLETED",
      completedAt: new Date(),
      executionTimeMs: Date.now() - startTime,
    })

    buffer.done = true
  } catch (error) {
    console.error("Chat gateway call failed:", error)

    await updateEmployeeRun(run.id, {
      status: "FAILED",
      completedAt: new Date(),
      executionTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    }).catch(() => {})

    const message = error instanceof Error ? error.message : "Unknown error"
    pushEvent(params.messageId, "error", { message })
    buffer.done = true
    buffer.error = message
  }
}

/**
 * Returns the cached polling events for one chat message.
 */
export function getChatEvents(messageId: string, after = 0): ChatEventPollResponse {
  const buffer = chatEventBuffers.get(messageId)
  if (!buffer) {
    return { events: [], done: true }
  }

  const events = buffer.events.filter((event) => event.seq >= after)
  return {
    events,
    done: buffer.done,
    error: buffer.error,
    nextSeq: buffer.events.length,
  }
}

/**
 * Loads persisted chat history for one employee.
 */
export async function getChatHistoryForEmployee(params: {
  employeeId: string
  context: ChatAccessContext
}): Promise<Record<string, unknown>[] | ServiceError> {
  const employee = await findEmployeeForChat(params.employeeId, params.context.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return (await findChatMessagesByEmployeeId(params.employeeId)) as Record<string, unknown>[]
}

/**
 * Sends a chat message to the employee gateway and starts background processing.
 */
export async function sendChatMessage(params: {
  employeeId: string
  context: ChatAccessContext
  input: ChatMessageInput
  awaitProcessing?: boolean
}): Promise<{ messageId: string } | ServiceError> {
  if (typeof params.input.message !== "string" || !params.input.message) {
    return { status: 400, error: "Message is required" }
  }

  const employee = await findEmployeeForChat(params.employeeId, params.context.organizationId)
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const group = employee.groupId ? await findEmployeeGroupById(employee.groupId) : null
  let containerUrl: string | null = null
  let gatewayToken: string | null = null
  let agentIdHeader: string | undefined

  if (group?.containerPort && group.containerId) {
    containerUrl = await orchestrator.getGroupContainerUrl(employee.groupId)
    gatewayToken = group.gatewayToken
    agentIdHeader = params.employeeId
  }

  if (!containerUrl && group) {
    try {
      const { port } = await orchestrator.startGroup(employee.groupId)
      containerUrl = `http://localhost:${port}`
      const refreshed = await findEmployeeGroupById(employee.groupId)
      gatewayToken = refreshed?.gatewayToken ?? null
      agentIdHeader = params.employeeId
    } catch (error) {
      console.error("Auto-start container failed:", error)
    }
  }

  if (!containerUrl) {
    return { status: 409, error: "Employee is not running. Start it first." }
  }

  await createChatMessage({
    digitalEmployeeId: params.employeeId,
    role: "user",
    content: params.input.message,
  })

  const recentMessages = await findRecentChatMessagesByEmployeeId(params.employeeId)
  const history = [...recentMessages].reverse().slice(0, -1)
  const contextMessage = buildConversationContextMessage(history, params.input.message)

  const messageId = crypto.randomUUID()
  chatEventBuffers.set(messageId, {
    events: [],
    done: false,
    createdAt: Date.now(),
  })

  const processing = processGatewayRequest({
    messageId,
    employeeId: params.employeeId,
    containerUrl,
    gatewayToken: gatewayToken || "",
    contextMessage,
    agentIdHeader,
  })

  if (params.awaitProcessing) {
    await processing
  } else {
    void processing.catch((error) => {
      console.error("Background gateway processing failed:", error)
    })
  }

  return { messageId }
}

export function __getChatEventBuffer(messageId: string) {
  return chatEventBuffers.get(messageId)
}
