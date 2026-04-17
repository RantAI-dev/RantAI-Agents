import { NextResponse } from "next/server"
import { getUserId } from "@/lib/get-user-id"
import { CreateConversationBodySchema } from "@/features/chat-public/schema"
import {
  createConversationRecord,
  isChatPublicServiceError,
  listConversations,
} from "@/features/chat-public/service"

export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await listConversations()
  if (isChatPublicServiceError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const userId = await getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
  }

  const parsedBody = CreateConversationBodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
  }

  const result = await createConversationRecord({ sessionId: parsedBody.data.sessionId })
  if (isChatPublicServiceError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}
