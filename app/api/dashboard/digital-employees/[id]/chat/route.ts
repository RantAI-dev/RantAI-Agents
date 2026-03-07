import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { orchestrator } from "@/lib/digital-employee"

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ParsedToolCall {
  toolCallId: string
  toolName: string
  input: unknown
  output?: string
}

/**
 * Extract structured tool calls from the gateway JSON response.
 */
function extractToolCalls(data: Record<string, unknown>): ParsedToolCall[] {
  for (const key of ["tool_calls", "toolCalls"]) {
    const arr = data[key]
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((item: Record<string, unknown>, i: number) => ({
        toolCallId: (item.toolCallId || item.tool_call_id || `tc_${i}`) as string,
        toolName: (item.toolName || item.tool_name || item.name || "unknown") as string,
        input: item.input || item.arguments || item.args || {},
        output: item.output != null
          ? (typeof item.output === "string" ? item.output : JSON.stringify(item.output))
          : "completed",
      }))
    }
  }
  return []
}

/**
 * Rewrite OAuth callback URLs (http://127.0.0.1:<port>/...) in text
 * to platform-routable URLs so the user's browser can reach them.
 *
 * Handles two cases:
 * A) redirect_uri parameter values containing localhost (inside OAuth authorization URLs)
 * B) Standalone localhost URLs in agent text output
 */
function rewriteOAuthUrls(text: string, employeeId: string): string {
  const basePath = `/api/dashboard/digital-employees/${employeeId}/oauth-proxy`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  // Case A: Rewrite redirect_uri parameter values containing localhost.
  // Handles both URL-encoded (%3A%2F%2F) and plain (://) forms.
  // Stops at & and whitespace so it doesn't consume outer URL query params.
  text = text.replace(
    /redirect_uri=(https?(?:%3A%2F%2F|:\/\/)(?:127\.0\.0\.1|localhost)(?:%3A|:)(\d+)((?:%2F|\/)[^\s&"'<>]*))/gi,
    (_match, _fullUrl, _port, encodedPath) => {
      const path = decodeURIComponent(encodedPath)
      const newRedirect = `${appUrl}${basePath}/direct${path}`
      return `redirect_uri=${encodeURIComponent(newRedirect)}`
    }
  )

  // Case B: Standalone localhost URLs (stop at & to avoid capturing query params of outer URL)
  text = text.replace(
    /https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)(\/[^\s"'<>&]*)/g,
    (_match, _port, path) => `${basePath}/direct${path}`
  )

  return text
}

function extractResponseText(data: Record<string, unknown>): string {
  for (const key of ["response", "text", "message", "content", "output"]) {
    const val = data[key]
    if (typeof val === "string" && val.length > 0) return val
  }
  return ""
}

// ─── In-memory event buffer for polling ────────────────────────────────────
// Each chat message gets a buffer of events. Frontend polls with GET /chat/events.
// Buffer is cleaned up after 10 minutes of inactivity.

interface ChatEvent {
  seq: number
  type: string
  data: Record<string, unknown>
}

interface ChatEventBuffer {
  events: ChatEvent[]
  done: boolean
  error?: string
  createdAt: number
}

// Global event store — works in self-hosted (single process).
// For serverless, replace with Redis/DB.
const chatEventBuffers = new Map<string, ChatEventBuffer>()

// Cleanup stale buffers every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, buf] of chatEventBuffers) {
    if (now - buf.createdAt > 10 * 60 * 1000) {
      chatEventBuffers.delete(key)
    }
  }
}, 5 * 60 * 1000)

function pushEvent(messageId: string, type: string, data: Record<string, unknown>) {
  const buf = chatEventBuffers.get(messageId)
  if (!buf) return
  buf.events.push({ seq: buf.events.length, type, data })
}

// ─── Background gateway processing ────────────────────────────────────────

async function processGatewayRequest(
  messageId: string,
  employeeId: string,
  containerUrl: string,
  gatewayToken: string,
  contextMessage: string,
) {
  const buf = chatEventBuffers.get(messageId)
  if (!buf) return

  try {
    // Try streaming endpoint first, fall back to JSON webhook
    let useStreaming = true
    let gatewayResponse: Response

    try {
      gatewayResponse = await fetch(`${containerUrl}/webhook/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({ message: contextMessage }),
        signal: AbortSignal.timeout(600_000),
      })

      if (gatewayResponse.status === 404) {
        useStreaming = false
        gatewayResponse = await fetch(`${containerUrl}/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayToken}`,
          },
          body: JSON.stringify({ message: contextMessage }),
          signal: AbortSignal.timeout(600_000),
        })
      }
    } catch {
      useStreaming = false
      gatewayResponse = await fetch(`${containerUrl}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({ message: contextMessage }),
        signal: AbortSignal.timeout(600_000),
      })
    }

    if (!gatewayResponse.ok) {
      const errText = await gatewayResponse.text()
      console.error("RantaiClaw gateway error:", gatewayResponse.status, errText)
      pushEvent(messageId, "error", {
        message: `Gateway returned ${gatewayResponse.status}. The employee may have timed out while processing.`,
      })
      buf.done = true
      return
    }

    const contentType = gatewayResponse.headers.get("content-type") || ""
    const isSSE = useStreaming && contentType.includes("text/event-stream")

    if (isSSE && gatewayResponse.body) {
      // ── SSE streaming mode: buffer real-time lifecycle events ──
      let assistantContent = ""
      const toolCalls: ParsedToolCall[] = []

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
              pushEvent(messageId, "thinking", {})
              break

            case "thinking-done":
              pushEvent(messageId, "thinking-done", {})
              break

            case "tool-start":
              pushEvent(messageId, "tool-input-start", {
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              })
              if (event.input != null) {
                pushEvent(messageId, "tool-input-available", {
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
              pushEvent(messageId, "tool-output-available", {
                toolCallId: event.toolCallId,
                output: event.output,
              })
              const tc = toolCalls.find((t) => t.toolCallId === event.toolCallId)
              if (tc) tc.output = (event.output as string) || "completed"
              break
            }

            case "tool-error":
              pushEvent(messageId, "tool-output-error", {
                toolCallId: event.toolCallId,
                errorText: event.error,
              })
              break

            case "text-delta":
              if (typeof event.delta === "string") {
                const delta = rewriteOAuthUrls(event.delta, employeeId)
                assistantContent += delta
                pushEvent(messageId, "text-delta", { delta })
              }
              break

            case "error":
              pushEvent(messageId, "error", { message: event.message })
              break

            case "agent-done":
              break
          }
        }
      }

      // Persist assistant message
      const content = assistantContent || "Task completed."
      await prisma.employeeChatMessage.create({
        data: {
          digitalEmployeeId: employeeId,
          role: "assistant",
          content,
          toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
        },
      })
    } else {
      // ── JSON fallback mode ──
      const gatewayData = await gatewayResponse.json()
      const displayText = extractResponseText(gatewayData) || "Task completed."
      const toolCalls = extractToolCalls(gatewayData)

      await prisma.employeeChatMessage.create({
        data: {
          digitalEmployeeId: employeeId,
          role: "assistant",
          content: displayText,
          toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
        },
      })

      // Emit tool calls as events
      for (const tc of toolCalls) {
        pushEvent(messageId, "tool-input-start", { toolCallId: tc.toolCallId, toolName: tc.toolName })
        pushEvent(messageId, "tool-input-available", { toolCallId: tc.toolCallId, input: tc.input })
        if (tc.output !== undefined) {
          pushEvent(messageId, "tool-output-available", { toolCallId: tc.toolCallId, output: tc.output })
        }
      }

      // Emit text in chunks
      if (displayText) {
        const CHUNK_SIZE = 100
        for (let i = 0; i < displayText.length; i += CHUNK_SIZE) {
          pushEvent(messageId, "text-delta", { delta: displayText.slice(i, i + CHUNK_SIZE) })
        }
      }
    }

    pushEvent(messageId, "agent-done", {})
    buf.done = true
  } catch (error) {
    console.error("Chat gateway call failed:", error)
    const errMsg = error instanceof Error ? error.message : "Unknown error"
    pushEvent(messageId, "error", { message: errMsg })
    buf.done = true
    buf.error = errMsg
  }
}

// ─── Route handlers ────────────────────────────────────────────────────────

// GET - Load chat history
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const url = new URL(req.url)

    // GET /chat/events?messageId=X&after=Y — poll for events
    const messageId = url.searchParams.get("messageId")
    if (messageId) {
      const after = parseInt(url.searchParams.get("after") || "0", 10)
      const buf = chatEventBuffers.get(messageId)
      if (!buf) {
        return NextResponse.json({ events: [], done: true })
      }
      const events = buf.events.filter((e) => e.seq >= after)
      return NextResponse.json({
        events,
        done: buf.done,
        error: buf.error,
        nextSeq: buf.events.length,
      })
    }

    // GET /chat — load full chat history
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const messages = await prisma.employeeChatMessage.findMany({
      where: { digitalEmployeeId: id },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json(messages)
  } catch (error) {
    console.error("Load chat history failed:", error)
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 })
  }
}

// POST - Send message to RantaiClaw gateway
// Returns immediately with messageId. Frontend polls GET /chat?messageId=X&after=Y for events.
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Verify container is running
    const containerUrl = await orchestrator.getContainerUrl(id)
    if (!containerUrl) {
      return NextResponse.json(
        { error: "Employee is not running. Start it first." },
        { status: 409 }
      )
    }

    const body = await req.json()
    const userMessage = body.message
    if (!userMessage || typeof userMessage !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Save user message
    await prisma.employeeChatMessage.create({
      data: {
        digitalEmployeeId: id,
        role: "user",
        content: userMessage,
      },
    })

    // Build context with conversation history
    const recentMessages = await prisma.employeeChatMessage.findMany({
      where: { digitalEmployeeId: id },
      orderBy: { createdAt: "desc" },
      take: 21,
    })
    const history = recentMessages.reverse().slice(0, -1)

    let contextMessage = userMessage
    if (history.length > 0) {
      const historyBlock = history
        .map((m) => `[${m.role === "user" ? "User" : "You"}]: ${m.content}`)
        .join("\n\n")
      contextMessage =
        `<conversation_history>\n${historyBlock}\n</conversation_history>\n\n[User]: ${userMessage}`
    }

    // Create event buffer and fire background processing
    const messageId = crypto.randomUUID()
    chatEventBuffers.set(messageId, {
      events: [],
      done: false,
      createdAt: Date.now(),
    })

    // Fire-and-forget: process gateway request in background
    // The promise is intentionally not awaited — it runs after the response is sent.
    processGatewayRequest(messageId, id, containerUrl, employee.gatewayToken || "", contextMessage)
      .catch((err) => console.error("Background gateway processing failed:", err))

    return NextResponse.json({ messageId }, { status: 202 })
  } catch (error) {
    console.error("Chat proxy failed:", error)
    const message = error instanceof Error ? error.message : "Chat failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
