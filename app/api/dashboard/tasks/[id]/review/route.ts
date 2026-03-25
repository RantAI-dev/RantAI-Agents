import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  SubmitTaskReviewBodySchema,
  TaskIdParamsSchema,
} from "@/src/features/digital-employees/tasks/schema"
import {
  isServiceError,
  reviewDashboardTask,
} from "@/src/features/digital-employees/tasks/service"

export async function POST(
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

  const parsedBody = SubmitTaskReviewBodySchema.safeParse(await request.json())
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "action must be one of: approve, changes, reject" },
      { status: 400 }
    )
  }

  const task = await reviewDashboardTask({
    taskId: parsedParams.data.id,
    organizationId: orgCtx.organizationId,
    input: parsedBody.data,
  })

  if (isServiceError(task)) {
    return NextResponse.json({ error: task.error }, { status: task.status })
  }

  return NextResponse.json(task)
}
