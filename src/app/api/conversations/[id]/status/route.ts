import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ConversationIdParamsSchema } from "@/features/chat-public/schema"
import {
  getConversationStatus,
  isChatPublicServiceError,
} from "@/features/chat-public/service"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
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
