import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  DashboardChatSessionIdParamsSchema,
  DashboardChatSessionMessageDeleteBodySchema,
  DashboardChatSessionMessageUpdateBodySchema,
  DashboardChatSessionMessagesBodySchema,
} from "@/features/conversations/sessions/schema"
import {
  addDashboardChatSessionMessages,
  deleteDashboardChatSessionMessages,
  updateDashboardChatSessionMessage,
} from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function POST(
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

    const parsedBody = DashboardChatSessionMessagesBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsedBody.error.issues },
        { status: 400 },
      )
    }
    const result = await addDashboardChatSessionMessages({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Messages API] POST error:", error)
    return NextResponse.json({ error: "Failed to add messages" }, { status: 500 })
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

    const parsedBody = DashboardChatSessionMessageUpdateBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsedBody.error.issues },
        { status: 400 },
      )
    }
    const result = await updateDashboardChatSessionMessage({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Messages API] PATCH error:", error)
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 })
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

    const parsedBody = DashboardChatSessionMessageDeleteBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsedBody.error.issues },
        { status: 400 },
      )
    }
    const result = await deleteDashboardChatSessionMessages({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Chat Messages API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete messages" }, { status: 500 })
  }
}
