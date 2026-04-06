import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  CreateTaskCommentBodySchema,
  TaskIdParamsSchema,
} from "@/features/digital-employees/tasks/schema"
import {
  createDashboardTaskComment,
  isServiceError,
  listDashboardTaskComments,
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

  const comments = await listDashboardTaskComments({
    taskId: parsedParams.data.id,
    organizationId: orgCtx.organizationId,
  })

  return NextResponse.json(comments)
}

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

  const parsedBody = CreateTaskCommentBodySchema.safeParse(await request.json())
  if (!parsedBody.success) {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  const comment = await createDashboardTaskComment({
    taskId: parsedParams.data.id,
    organizationId: orgCtx.organizationId,
    userId: session.user.id,
    input: parsedBody.data,
  })

  if (isServiceError(comment)) {
    return NextResponse.json({ error: comment.error }, { status: comment.status })
  }

  return NextResponse.json(comment, { status: 201 })
}
