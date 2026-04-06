import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import {
  RuntimeMessageParamsSchema,
  RuntimeReplySchema,
} from "@/features/runtime/messages/schema"
import { replyToRuntimeMessage } from "@/features/runtime/messages/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const parsedParams = RuntimeMessageParamsSchema.safeParse(await params)
    if (!parsedParams.success || !parsedParams.data.id) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const parsedBody = RuntimeReplySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = await replyToRuntimeMessage(parsedParams.data.id, parsedBody.data)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to reply to message:", error)
    return NextResponse.json({ error: "Failed to reply" }, { status: 500 })
  }
}
