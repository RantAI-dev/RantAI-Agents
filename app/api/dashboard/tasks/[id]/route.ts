import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  proxyGetTaskDetail,
  proxyUpdateTask,
  proxyDeleteTask,
} from "@/lib/digital-employee/task-aggregator"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContextWithFallback(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const detail = await proxyGetTaskDetail(id, orgCtx.organizationId)
  if (!detail) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  return NextResponse.json(detail)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContextWithFallback(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  const task = await proxyUpdateTask(id, body, orgCtx.organizationId)
  if (!task) {
    return NextResponse.json({ error: "Task not found or update failed" }, { status: 404 })
  }

  return NextResponse.json(task)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContextWithFallback(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  await proxyDeleteTask(id, orgCtx.organizationId)

  return NextResponse.json({ success: true })
}
