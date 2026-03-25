import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  CreateTaskBodySchema,
  parseTaskFilterSearchParams,
} from "@/src/features/digital-employees/tasks/schema"
import {
  createDashboardTask,
  isServiceError,
  listDashboardTasks,
} from "@/src/features/digital-employees/tasks/service"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContextWithFallback(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const filter = parseTaskFilterSearchParams(request.nextUrl.searchParams)
    const tasks = await listDashboardTasks({
      organizationId: orgCtx.organizationId,
      filter,
    })

    return NextResponse.json(tasks)
  } catch (error) {
    console.error("[Dashboard Tasks API] GET error:", error)
    return NextResponse.json({ error: "Failed to list tasks" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContextWithFallback(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const parsed = CreateTaskBodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "title is required" }, { status: 400 })
    }

    const task = await createDashboardTask({
      organizationId: orgCtx.organizationId,
      userId: session.user.id,
      input: parsed.data,
    })

    if (isServiceError(task)) {
      return NextResponse.json({ error: task.error }, { status: task.status })
    }

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error("[Dashboard Tasks API] POST error:", error)
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 })
  }
}
