import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { HandoffStatusQuerySchema } from "@/src/features/handoff/schema"
import {
  createDashboardHandoffRequest,
  getDashboardHandoffStatus,
} from "@/src/features/handoff/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()

    const result = await createDashboardHandoffRequest({
      actor: {
        userId: session.user.id,
        userName: session.user.name || null,
        userEmail: session.user.email || null,
      },
      input: body,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Dashboard Handoff] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedQuery = HandoffStatusQuerySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams.entries())
    )
    if (!parsedQuery.success || !parsedQuery.data.conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 })
    }

    const result = await getDashboardHandoffStatus({
      conversationId: parsedQuery.data.conversationId,
      after: parsedQuery.data.after || null,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Dashboard Handoff] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
