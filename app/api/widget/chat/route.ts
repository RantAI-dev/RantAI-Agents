import { NextRequest, NextResponse } from "next/server"
import {
  handleWidgetChat,
  WIDGET_CHAT_CORS_HEADERS,
} from "@/src/features/widget/chat/service"

// POST /api/widget/chat - Handle widget chat messages (streaming)
export async function POST(req: NextRequest) {
  return handleWidgetChat(req)
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: WIDGET_CHAT_CORS_HEADERS,
  })
}
