import { NextResponse } from "next/server"
import { getRequestUserId } from "@/lib/mobile-auth"
import {
  DashboardChatSessionCreateBodySchema,
} from "@/features/conversations/sessions/schema"
import {
  createDashboardChatSession,
  listDashboardChatSessions,
} from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await listDashboardChatSessions({ userId })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Sessions API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch chat sessions" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getRequestUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedBody = DashboardChatSessionCreateBodySchema.safeParse(await req.json())
    // Surface Zod issues directly. Without this guard, `parsedBody.data`
    // (undefined on Zod failure) flows into the service, which silently
    // falls back to its own per-field guards and emits a less precise
    // 400 — losing the structured error from Zod entirely.
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsedBody.error.issues },
        { status: 400 },
      )
    }
    const result = await createDashboardChatSession({
      userId,
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
