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
 * The new RantaiClaw gateway returns tool_calls as a JSON array with
 * toolCallId, toolName, input, and output fields.
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
 * Extract response text from the gateway JSON.
 */
function extractResponseText(data: Record<string, unknown>): string {
  for (const key of ["response", "text", "message", "content", "output"]) {
    const val = data[key]
    if (typeof val === "string" && val.length > 0) return val
  }
  return ""
}

// GET - Load chat history
export async function GET(req: Request, { params }: RouteParams) {
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

    // Load recent conversation history so the agent has context.
    // RantaiClaw webhook is stateless — each call starts fresh.
    // We prepend prior turns as a context block in the message.
    const recentMessages = await prisma.employeeChatMessage.findMany({
      where: { digitalEmployeeId: id },
      orderBy: { createdAt: "desc" },
      take: 21, // 10 exchanges + current user message
    })
    // Reverse to chronological, exclude the message we just saved (last one)
    const history = recentMessages.reverse().slice(0, -1)

    let contextMessage = userMessage
    if (history.length > 0) {
      const historyBlock = history
        .map((m) => `[${m.role === "user" ? "User" : "You"}]: ${m.content}`)
        .join("\n\n")
      contextMessage =
        `<conversation_history>\n${historyBlock}\n</conversation_history>\n\n[User]: ${userMessage}`
    }

    // Forward to RantaiClaw gateway (runs full agentic loop with tools — may take up to 2 min)
    const gatewayResponse = await fetch(`${containerUrl}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employee.gatewayToken}`,
      },
      body: JSON.stringify({ message: contextMessage }),
      signal: AbortSignal.timeout(130_000), // 130s — slightly above RantaiClaw's 120s limit
    })

    if (!gatewayResponse.ok) {
      const errText = await gatewayResponse.text()
      console.error("RantaiClaw gateway error:", gatewayResponse.status, errText)
      return NextResponse.json(
        { error: "Gateway error: " + gatewayResponse.status },
        { status: 502 }
      )
    }

    const gatewayData = await gatewayResponse.json()

    // Extract response text and structured tool calls
    const displayText = extractResponseText(gatewayData) || "Task completed."
    const toolCalls = extractToolCalls(gatewayData)

    // Save assistant message
    await prisma.employeeChatMessage.create({
      data: {
        digitalEmployeeId: id,
        role: "assistant",
        content: displayText,
        toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
      },
    })

    // Stream response as SSE matching ChatWorkspace format
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        // Emit tool calls first so UI shows them while text streams in
        for (const tc of toolCalls) {
          emit({ type: "tool-input-start", toolCallId: tc.toolCallId, toolName: tc.toolName })
          emit({ type: "tool-input-available", toolCallId: tc.toolCallId, input: tc.input })
          if (tc.output !== undefined) {
            emit({ type: "tool-output-available", toolCallId: tc.toolCallId, output: tc.output })
          }
        }

        // Stream text in small chunks for typing effect
        if (displayText) {
          const CHUNK_SIZE = 3
          const DELAY_MS = 15
          for (let i = 0; i < displayText.length; i += CHUNK_SIZE) {
            const delta = displayText.slice(i, i + CHUNK_SIZE)
            emit({ type: "text-delta", delta })
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    })
  } catch (error) {
    console.error("Chat proxy failed:", error)
    const message = error instanceof Error ? error.message : "Chat failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
