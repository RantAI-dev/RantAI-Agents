import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { DashboardMemoryIdParamsSchema } from "@/src/features/memory/schema"
import { deleteDashboardMemory } from "@/src/features/memory/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardMemoryIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const result = await deleteDashboardMemory({
      userId: session.user.id,
      memoryId: parsedParams.data.id,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Memory API] DELETE by id error:", error)
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 })
  }
}
