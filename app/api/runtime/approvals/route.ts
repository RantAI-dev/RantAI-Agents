import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

// POST - VM requests an approval from human
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId, runId } = await verifyRuntimeToken(token)

    const body = await req.json()
    const {
      requestType, title, description, content,
      options, workflowStepId, expiresInMs, timeoutAction,
    } = body

    if (!requestType || !title || !content || !options) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const approval = await prisma.employeeApproval.create({
      data: {
        digitalEmployeeId: employeeId,
        employeeRunId: runId,
        workflowStepId: workflowStepId || null,
        requestType,
        title,
        description: description || null,
        content,
        options,
        timeoutAction: timeoutAction || null,
        expiresAt: expiresInMs ? new Date(Date.now() + expiresInMs) : null,
      },
    })

    // Pause the run
    await prisma.employeeRun.update({
      where: { id: runId },
      data: { status: "PAUSED" },
    })

    return NextResponse.json(approval, { status: 201 })
  } catch (error) {
    console.error("Runtime approval request failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
