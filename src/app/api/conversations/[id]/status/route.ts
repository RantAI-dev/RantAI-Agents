import { NextResponse } from "next/server"
import { getUserId } from "@/lib/get-user-id"
import { ConversationIdParamsSchema } from "@/features/chat-public/schema"
import {
  getConversationStatus,
  isChatPublicServiceError,
} from "@/features/chat-public/service"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedParams = ConversationIdParamsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 })
  }

  const result = await getConversationStatus({
    conversationId: parsedParams.data.id,
  })

  if (isChatPublicServiceError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}
