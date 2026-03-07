import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { orchestrator } from "@/lib/digital-employee"
import type { ApprovalResponse } from "@/lib/digital-employee/types"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { status, response, responseData } = body

    if (!status || !["approved", "rejected", "edited"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const approval = await prisma.employeeApproval.findUnique({
      where: { id },
    })

    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 })
    }

    if (approval.status !== "PENDING" && approval.status !== "DELIVERED") {
      return NextResponse.json({ error: "Approval already responded" }, { status: 400 })
    }

    // Map response status to approval status enum
    const approvalStatusMap: Record<string, "APPROVED" | "REJECTED" | "EDITED"> = {
      approved: "APPROVED",
      rejected: "REJECTED",
      edited: "EDITED",
    }

    await prisma.employeeApproval.update({
      where: { id },
      data: {
        status: approvalStatusMap[status],
        respondedBy: session.user.id,
        response: response || null,
        responseData: responseData || null,
        respondedAt: new Date(),
      },
    })

    // If the approval was for a paused run, resume it
    if (approval.employeeRunId) {
      const run = await prisma.employeeRun.findUnique({
        where: { id: approval.employeeRunId },
      })

      if (run && run.status === "PAUSED") {
        const approvalResponse: ApprovalResponse = {
          status,
          response,
          responseData,
          respondedBy: session.user.id,
        }

        try {
          await orchestrator.resumeRun(run.id, approvalResponse)
        } catch (error) {
          console.error("Failed to resume run:", error)
        }
      }
    }

    // C7: Handle message_send approvals
    if (approval.requestType === "message_send" && approval.content) {
      const messageData = approval.content as Record<string, unknown>
      const messageId = messageData.messageId as string
      if (messageId) {
        if (approvalStatusMap[status] === "APPROVED") {
          // Mark message as pending (ready for delivery)
          await prisma.employeeMessage.update({
            where: { id: messageId },
            data: { status: "pending" },
          })
        } else {
          // Mark message as cancelled
          await prisma.employeeMessage.update({
            where: { id: messageId },
            data: { status: "cancelled" },
          })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to respond to approval:", error)
    return NextResponse.json({ error: "Failed to respond" }, { status: 500 })
  }
}
