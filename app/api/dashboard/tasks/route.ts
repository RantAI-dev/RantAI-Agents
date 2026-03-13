import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { fanOutTaskQuery, proxyCreateTask } from "@/lib/digital-employee/task-aggregator"
import type { TaskFilter } from "@/lib/digital-employee/task-types"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  const filter: TaskFilter = {}
  if (searchParams.get("status")) filter.status = searchParams.get("status") as TaskFilter["status"]
  if (searchParams.get("assigneeId")) filter.assigneeId = searchParams.get("assigneeId")!
  if (searchParams.get("groupId")) filter.groupId = searchParams.get("groupId")!
  if (searchParams.get("priority")) filter.priority = searchParams.get("priority") as TaskFilter["priority"]
  if (searchParams.get("topLevelOnly") === "true") filter.topLevelOnly = true

  const tasks = await fanOutTaskQuery(orgCtx.organizationId, filter)
  return NextResponse.json(tasks)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  if (!body.title || typeof body.title !== "string" || body.title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  const task = await proxyCreateTask(orgCtx.organizationId, {
    ...body,
    created_by_user_id: session.user.id,
  })

  if (!task) {
    return NextResponse.json({ error: "No active container available to create task" }, { status: 503 })
  }

  return NextResponse.json(task, { status: 201 })
}
