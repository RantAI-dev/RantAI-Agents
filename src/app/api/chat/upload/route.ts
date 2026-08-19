import { NextResponse } from "next/server"
import { getRequestUserId } from "@/lib/mobile-auth"
import { ChatUploadFormSchema } from "@/features/chat-public/schema"
import {
  isChatPublicServiceError,
  uploadChatAttachment,
} from "@/features/chat-public/service"

export async function POST(req: Request) {
  const userId = await getRequestUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const parsedForm = ChatUploadFormSchema.safeParse({
    file: formData.get("file"),
    sessionId: formData.get("sessionId"),
  })

  if (!parsedForm.success) {
    return NextResponse.json(
      { error: "No file provided", code: "MISSING_FILE" },
      { status: 400 }
    )
  }

  const result = await uploadChatAttachment({
    file: parsedForm.data.file,
    sessionId: parsedForm.data.sessionId,
    userId,
  })

  if (isChatPublicServiceError(result)) {
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status }
    )
  }

  return NextResponse.json(result)
}
