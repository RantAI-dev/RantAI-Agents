import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

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

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const before = searchParams.get("before")

    // Fetch runs and approvals in parallel
    const [runs, approvals] = await Promise.all([
      prisma.employeeRun.findMany({
        where: {
          digitalEmployeeId: id,
          ...(before ? { startedAt: { lt: new Date(before) } } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: limit,
      }),
      prisma.employeeApproval.findMany({
        where: {
          digitalEmployeeId: id,
          ...(before ? { createdAt: { lt: new Date(before) } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ])

    // Merge into unified event list
    type ActivityEvent = {
      id: string
      type: string
      timestamp: string
      data: Record<string, unknown>
    }

    const events: ActivityEvent[] = []

    for (const run of runs) {
      events.push({
        id: `run-${run.id}`,
        type: run.status === "RUNNING"
          ? "run_started"
          : run.status === "COMPLETED"
            ? "run_completed"
            : "run_failed",
        timestamp: (run.completedAt || run.startedAt).toISOString(),
        data: {
          runId: run.id,
          trigger: run.trigger,
          status: run.status,
          promptTokens: run.promptTokens,
          completionTokens: run.completionTokens,
          executionTimeMs: run.executionTimeMs,
          error: run.error,
          output: run.output,
        },
      })
    }

    for (const approval of approvals) {
      events.push({
        id: `approval-${approval.id}`,
        type: approval.status === "PENDING"
          ? "approval_requested"
          : "approval_responded",
        timestamp: (approval.respondedAt || approval.createdAt).toISOString(),
        data: {
          approvalId: approval.id,
          title: approval.title,
          description: approval.description,
          requestType: approval.requestType,
          status: approval.status,
          respondedBy: approval.respondedBy,
          response: approval.response,
        },
      })
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Daily summary for today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayRuns = runs.filter((r) => new Date(r.startedAt) >= todayStart)
    const dailySummary = {
      totalRuns: todayRuns.length,
      completed: todayRuns.filter((r) => r.status === "COMPLETED").length,
      failed: todayRuns.filter((r) => r.status === "FAILED").length,
      totalTokens: todayRuns.reduce((sum, r) => sum + r.promptTokens + r.completionTokens, 0),
    }

    return NextResponse.json({
      events: events.slice(0, limit),
      dailySummary,
    })
  } catch (error) {
    console.error("Failed to fetch activity:", error)
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 })
  }
}
