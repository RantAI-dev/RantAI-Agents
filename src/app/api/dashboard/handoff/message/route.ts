import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { HandoffMessageBodySchema } from "@/features/handoff/schema"
import { sendDashboardHandoffMessage } from "@/features/handoff/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedBody = HandoffMessageBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "conversationId and content are required" },
        { status: 400 }
      )
    }

    const result = await sendDashboardHandoffMessage({
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Dashboard Handoff Message] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
