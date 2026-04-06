import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeSendMessageSchema } from "@/features/runtime/messages/schema"
import { sendRuntimeMessage } from "@/features/runtime/messages/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const parsed = RuntimeSendMessageSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = await sendRuntimeMessage(parsed.data)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to send message:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
