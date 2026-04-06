import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ChatAttachmentFileParamsSchema } from "@/features/chat-public/schema"
import {
  getChatAttachment,
  isChatPublicServiceError,
} from "@/features/chat-public/service"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedParams = ChatAttachmentFileParamsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid file ID" }, { status: 400 })
  }

  const result = await getChatAttachment(parsedParams.data.fileId)
  if (isChatPublicServiceError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return result
}
