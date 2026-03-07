import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { MESSAGE_TYPES, MESSAGE_PRIORITIES } from "@/lib/digital-employee/messaging"

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
      select: { id: true, organizationId: true },
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

    return NextResponse.json({ success: true, messageId: message.id })
  } catch (error) {
    console.error("Failed to send message:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
