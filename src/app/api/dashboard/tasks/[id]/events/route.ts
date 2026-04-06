import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { TaskIdParamsSchema } from "@/features/digital-employees/tasks/schema"
import { listDashboardTaskEvents } from "@/features/digital-employees/tasks/service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContextWithFallback(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsedParams = TaskIdParamsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 })
  }

  const events = await listDashboardTaskEvents({
    taskId: parsedParams.data.id,
    organizationId: orgCtx.organizationId,
  })

  return NextResponse.json(events)
}
