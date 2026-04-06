import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { DashboardMemoryBulkDeleteBodySchema } from "@/features/memory/schema"
import {
  clearDashboardMemories,
  listDashboardMemories,
} from "@/features/memory/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const result = await listDashboardMemories({
      userId: session.user.id,
      type: url.searchParams.get("type"),
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Memory API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch memories" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedBody = DashboardMemoryBulkDeleteBodySchema.safeParse(await req.json())
    const result = await clearDashboardMemories({
      userId: session.user.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Memory API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to clear memories" }, { status: 500 })
  }
}
