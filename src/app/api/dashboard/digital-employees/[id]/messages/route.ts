import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeMessageListQuerySchema,
} from "@/features/digital-employees/interactions/schema"
import {
  isServiceError,
  listDigitalEmployeeMessages,
} from "@/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const { searchParams } = new URL(req.url)
    const parsed = DashboardDigitalEmployeeMessageListQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      before: searchParams.get("before") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const messages = await listDigitalEmployeeMessages({
      id,
      organizationId: orgContext?.organizationId ?? null,
      query: parsed.data,
    })
    if (isServiceError(messages)) {
      return NextResponse.json({ error: messages.error }, { status: messages.status })
    }

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Failed to fetch messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}
