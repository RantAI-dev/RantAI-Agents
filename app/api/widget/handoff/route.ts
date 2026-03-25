import { NextRequest, NextResponse } from "next/server"
import { extractOrigin } from "@/lib/embed"
import { ConversationStatus } from "@/types/socket"
import { getIOInstance, broadcastQueueUpdate } from "@/lib/socket"
import type { QueueConversation } from "@/types/socket"
import {
  WIDGET_CORS_HEADERS,
  createWidgetHandoff,
  isServiceError,
  pollWidgetHandoff,
} from "@/src/features/widget/service"
import {
  WidgetHandoffCreateSchema,
  WidgetHandoffPollQuerySchema,
} from "@/src/features/widget/schema"

const corsHeaders = {
  ...WIDGET_CORS_HEADERS,
}

// POST /api/widget/handoff — Create a handoff request
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("X-Widget-Api-Key")
    const origin = extractOrigin(req.headers)

    const parsed = WidgetHandoffCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_REQUEST" },
        { status: 400, headers: corsHeaders }
      )
    }

    const result = await createWidgetHandoff({
      apiKey,
      origin,
      input: parsed.data,
    })

    if (isServiceError(result)) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
        },
        { status: result.status, headers: corsHeaders }
      )
    }

    const io = getIOInstance()
    if (io) {
      const queueConversation: QueueConversation = {
        id: result.conversation.id,
        sessionId: result.conversation.sessionId,
        customerName: result.conversation.customerName,
        customerEmail: result.conversation.customerEmail,
        customerPhone: result.conversation.customerPhone,
        productInterest: result.conversation.productInterest,
        channel: result.conversation.channel,
        createdAt: result.conversation.createdAt,
        handoffAt: result.conversation.handoffAt,
        messagePreview: result.lastMessagePreview,
      }

      io.to("agents").emit("conversation:new", queueConversation)
      await broadcastQueueUpdate(io)
    }

    return NextResponse.json(
      {
        conversationId: result.conversation.id,
        status: ConversationStatus.WAITING_FOR_AGENT,
        queuePosition: result.queuePosition,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("[Widget Handoff] POST error:", error)
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders }
    )
  }
}

// GET /api/widget/handoff?conversationId=...&after=... — Poll for status + new messages
export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get("X-Widget-Api-Key")
    const origin = extractOrigin(req.headers)

    const parsedQuery = WidgetHandoffPollQuerySchema.safeParse({
      conversationId: req.nextUrl.searchParams.get("conversationId") ?? undefined,
      after: req.nextUrl.searchParams.get("after") ?? undefined,
    })

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "conversationId is required", code: "MISSING_PARAM" },
        { status: 400, headers: corsHeaders }
      )
    }

    const result = await pollWidgetHandoff({
      apiKey,
      origin,
      conversationId: parsedQuery.data.conversationId,
      after: parsedQuery.data.after,
    })

    if (isServiceError(result)) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
        },
        { status: result.status, headers: corsHeaders }
      )
    }

    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    console.error("[Widget Handoff] GET error:", error)
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
