import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  DashboardChatSessionCreateBodySchema,
} from "@/features/conversations/sessions/schema"
import {
  createDashboardChatSession,
  listDashboardChatSessions,
} from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await listDashboardChatSessions({ userId: session.user.id })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Sessions API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch chat sessions" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedBody = DashboardChatSessionCreateBodySchema.safeParse(await req.json())
    const result = await createDashboardChatSession({
      userId: session.user.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Sessions API] POST error:", error)
    return NextResponse.json({ error: "Failed to create chat session" }, { status: 500 })
  }
}
