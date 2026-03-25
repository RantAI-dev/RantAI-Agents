import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  DashboardChatSessionIdParamsSchema,
  DashboardChatSessionUpdateBodySchema,
} from "@/src/features/conversations/sessions/schema"
import {
  deleteDashboardChatSession,
  getDashboardChatSession,
  updateDashboardChatSession,
} from "@/src/features/conversations/sessions/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const result = await getDashboardChatSession({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Session API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch chat session" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const parsedBody = DashboardChatSessionUpdateBodySchema.safeParse(await req.json())
    const result = await updateDashboardChatSession({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Session API] PATCH error:", error)
    return NextResponse.json({ error: "Failed to update chat session" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const result = await deleteDashboardChatSession({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Session API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete chat session" }, { status: 500 })
  }
}
