import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { MESSAGE_TYPES, MESSAGE_PRIORITIES } from "@/lib/digital-employee/messaging"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const body = await req.json()
    const { employeeId, toEmployeeId, toGroup, type, subject, content, priority, attachments, waitForResponse } = body

    if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 })
    if (!type || !MESSAGE_TYPES.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 })
    if (!subject) return NextResponse.json({ error: "subject required" }, { status: 400 })
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 })
    if (!toEmployeeId && !toGroup) return NextResponse.json({ error: "toEmployeeId or toGroup required" }, { status: 400 })

    // Verify sender exists
    const sender = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      select: { id: true, organizationId: true, autonomyLevel: true, supervisorId: true },
    })
    if (!sender) return NextResponse.json({ error: "Sender not found" }, { status: 404 })

    // Verify recipient is in same org
    if (toEmployeeId) {
      const recipient = await prisma.digitalEmployee.findFirst({
        where: { id: toEmployeeId, organizationId: sender.organizationId },
        select: { id: true },
      })
      if (!recipient) return NextResponse.json({ error: "Recipient not found in organization" }, { status: 404 })
    }

    // C7: Supervisor message approval for L1/L2 employees on task/handoff messages
    const requiresApproval = (sender.autonomyLevel === "L1" || sender.autonomyLevel === "L2") &&
      (type === "task" || type === "handoff")

    if (requiresApproval) {
      // Create message in pending_approval status
      const message = await prisma.employeeMessage.create({
        data: {
          organizationId: sender.organizationId,
          fromEmployeeId: employeeId,
          toEmployeeId: toEmployeeId || null,
          toGroup: toGroup || null,
          type,
          subject,
          content,
          priority: priority && MESSAGE_PRIORITIES.includes(priority) ? priority : "normal",
          attachments: attachments || [],
          status: "pending_approval",
          metadata: waitForResponse ? { waitForResponse: true } : {},
        },
      })

      // Create approval request for supervisor
      // Find the current active run for this employee to link the approval
      const activeRun = await prisma.employeeRun.findFirst({
        where: { digitalEmployeeId: employeeId, status: { in: ["RUNNING", "PAUSED"] } },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      })

      if (activeRun) {
        await prisma.employeeApproval.create({
          data: {
            digitalEmployeeId: employeeId,
            employeeRunId: activeRun.id,
            requestType: "message_send",
            title: `Send ${type} to ${toEmployeeId ? "employee" : toGroup || "group"}`,
            description: subject,
            content: { messageId: message.id, type, subject, content, toEmployeeId, toGroup } as object,
            options: [
              { label: "Approve", value: "approved" },
              { label: "Reject", value: "rejected" },
            ] as object,
          },
        })
      }

      logAudit({
        organizationId: sender.organizationId,
        employeeId: employeeId,
        action: AUDIT_ACTIONS.MESSAGE_SEND,
        resource: `message:${message.id}`,
        detail: { type, toEmployeeId, toGroup, subject, requiresApproval: true },
        riskLevel: classifyActionRisk(AUDIT_ACTIONS.MESSAGE_SEND),
      }).catch(() => {})

      return NextResponse.json({ success: true, messageId: message.id, requiresApproval: true })
    }

    const validPriority = priority && MESSAGE_PRIORITIES.includes(priority) ? priority : "normal"

    const message = await prisma.employeeMessage.create({
      data: {
        organizationId: sender.organizationId,
        fromEmployeeId: employeeId,
        toEmployeeId: toEmployeeId || null,
        toGroup: toGroup || null,
        type,
        subject,
        content,
        priority: validPriority,
        attachments: attachments || [],
        metadata: waitForResponse ? { waitForResponse: true } : {},
      },
    })

    logAudit({
      organizationId: sender.organizationId,
      employeeId: employeeId,
      action: AUDIT_ACTIONS.MESSAGE_SEND,
      resource: `message:${message.id}`,
      detail: { type, toEmployeeId, toGroup, subject },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.MESSAGE_SEND),
    }).catch(() => {})

    // For task messages with waitForResponse, indicate the agent should poll
    if (type === "task" && waitForResponse) {
      return NextResponse.json({ success: true, messageId: message.id, waitingForResponse: true })
    }

    return NextResponse.json({ success: true, messageId: message.id })
  } catch (error) {
    console.error("Failed to send message:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
