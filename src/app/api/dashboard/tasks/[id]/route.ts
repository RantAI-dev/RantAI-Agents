import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  TaskIdParamsSchema,
  UpdateTaskBodySchema,
} from "@/features/digital-employees/tasks/schema"
import {
  deleteDashboardTask,
  getDashboardTaskDetail,
  isServiceError,
  updateDashboardTask,
} from "@/features/digital-employees/tasks/service"

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

  const detail = await getDashboardTaskDetail({
    taskId: parsedParams.data.id,
    organizationId: orgCtx.organizationId,
  })
  if (isServiceError(detail)) {
    return NextResponse.json({ error: detail.error }, { status: detail.status })
  }

  return NextResponse.json(detail)
}

export async function PUT(
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

  const parsedBody = UpdateTaskBodySchema.safeParse(await request.json())
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
  }

  const task = await updateDashboardTask({
    taskId: parsedParams.data.id,
    organizationId: orgCtx.organizationId,
    input: parsedBody.data,
  })
  if (isServiceError(task)) {
    return NextResponse.json({ error: task.error }, { status: task.status })
  }

  return NextResponse.json(task)
}

export async function DELETE(
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

  const result = await deleteDashboardTask({
    taskId: parsedParams.data.id,
    organizationId: orgCtx.organizationId,
  })

  return NextResponse.json(result)
}
