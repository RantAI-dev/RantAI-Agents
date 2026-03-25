import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  ChatMessageBodySchema,
  ChatQuerySchema,
  DigitalEmployeeIdParamsSchema,
} from "@/src/features/digital-employees/chat/schema"
import {
  getChatEvents,
  getChatHistoryForEmployee,
  sendChatMessage,
} from "@/src/features/digital-employees/chat/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const url = new URL(req.url)
    const query = ChatQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!query.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const messageId = typeof query.data.messageId === "string" ? query.data.messageId : null
    if (messageId) {
      const after =
        typeof query.data.after === "string" ? Number.parseInt(query.data.after || "0", 10) : 0
      return NextResponse.json(getChatEvents(messageId, after))
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await getChatHistoryForEmployee({
      employeeId: parsedParams.data.id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Load chat history failed:", error)
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const body = ChatMessageBodySchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await sendChatMessage({
      employeeId: parsedParams.data.id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
      input: body.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    console.error("Chat proxy failed:", error)
    const message = error instanceof Error ? error.message : "Chat failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
