import { NextRequest, NextResponse } from "next/server"
import { extractOrigin } from "@/lib/embed"
import { getIOInstance } from "@/lib/socket"
import {
  WIDGET_CORS_HEADERS,
  createWidgetHandoffMessage,
  isServiceError,
} from "@/features/widget/service"
import { WidgetHandoffMessageSchema } from "@/features/widget/schema"

const corsHeaders = {
  ...WIDGET_CORS_HEADERS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// POST /api/widget/handoff/message — Send a message from the widget to an active conversation
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("X-Widget-Api-Key")
    const origin = extractOrigin(req.headers)

    const parsed = WidgetHandoffMessageSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "conversationId and content are required", code: "MISSING_PARAM" },
        { status: 400, headers: corsHeaders }
      )
    }

    const result = await createWidgetHandoffMessage({
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
      io.to(`conversation:${result.conversation.sessionId}`).emit(
        "conversation:message",
        {
          conversationId: result.conversation.id,
          id: result.message.id,
          role: result.message.role,
          content: result.message.content,
          createdAt: result.message.createdAt,
        }
      )
    }

    return NextResponse.json(
      { messageId: result.message.id },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("[Widget Handoff Message] POST error:", error)
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
