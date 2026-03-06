import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/cron/approvals - Check for expired approvals
export async function GET() {
  try {
    const now = new Date()

    const expiredApprovals = await prisma.employeeApproval.findMany({
      where: {
        status: { in: ["PENDING", "DELIVERED"] },
        expiresAt: { lt: now },
      },
    })

    let processed = 0
    for (const approval of expiredApprovals) {
      await prisma.employeeApproval.update({
        where: { id: approval.id },
        data: {
          status: "EXPIRED",
          respondedAt: now,
        },
      })

      // Apply timeout action if configured
      if (approval.timeoutAction === "approve") {
        // Auto-approve the pending action
        const run = await prisma.employeeRun.findUnique({
          where: { id: approval.employeeRunId },
        })
        if (run && run.status === "PAUSED") {
          // Resume with auto-approval — in production, call orchestrator.resumeRun
          await prisma.employeeRun.update({
            where: { id: run.id },
            data: { status: "FAILED", error: "Approval expired", completedAt: now },
          })
        }
      } else if (approval.timeoutAction === "reject") {
        const run = await prisma.employeeRun.findUnique({
          where: { id: approval.employeeRunId },
        })
        if (run && run.status === "PAUSED") {
          await prisma.employeeRun.update({
            where: { id: run.id },
            data: { status: "FAILED", error: "Approval expired (rejected)", completedAt: now },
          })
        }
      }

      processed++
    }

    return NextResponse.json({ processed, total: expiredApprovals.length })
  } catch (error) {
    console.error("Approval cron failed:", error)
    return NextResponse.json({ error: "Cron failed" }, { status: 500 })
  }
}
