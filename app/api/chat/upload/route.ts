import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ChatUploadFormSchema } from "@/src/features/chat-public/schema"
import {
  isChatPublicServiceError,
  uploadChatAttachment,
} from "@/src/features/chat-public/service"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
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
    userId: session.user.id,
  })

  if (isChatPublicServiceError(result)) {
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status }
    )
  }

  return NextResponse.json(result)
}
