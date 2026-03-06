import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

interface RouteParams {
  params: Promise<{ runId: string }>
}

// POST - VM reports run status
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { runId: tokenRunId } = await verifyRuntimeToken(token)
    const { runId } = await params

    if (tokenRunId !== runId) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 })
    }

    const body = await req.json()
    const { status, error, executionTimeMs, promptTokens, completionTokens } = body

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (error) updateData.error = error
    if (executionTimeMs) updateData.executionTimeMs = executionTimeMs
    if (promptTokens) updateData.promptTokens = promptTokens
    if (completionTokens) updateData.completionTokens = completionTokens
    if (status === "COMPLETED" || status === "FAILED") {
      updateData.completedAt = new Date()
    }

    await prisma.employeeRun.update({
      where: { id: runId },
      data: updateData,
    })

    // Update employee stats
    const run = await prisma.employeeRun.findUnique({ where: { id: runId } })
    if (run && (status === "COMPLETED" || status === "FAILED")) {
      await prisma.digitalEmployee.update({
        where: { id: run.digitalEmployeeId },
        data: {
          lastActiveAt: new Date(),
          ...(status === "COMPLETED" ? { successfulRuns: { increment: 1 } } : {}),
          ...(status === "FAILED" ? { failedRuns: { increment: 1 } } : {}),
          ...(promptTokens || completionTokens
            ? { totalTokensUsed: { increment: (promptTokens || 0) + (completionTokens || 0) } }
            : {}),
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Runtime status update failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
