import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const { id } = await params
    const { employeeId, content, data } = await req.json()

    if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 })
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 })

    // Find original message and verify recipient matches
    const originalMessage = await prisma.employeeMessage.findUnique({
      where: { id },
      select: {
        id: true,
        toEmployeeId: true,
        fromEmployeeId: true,
        organizationId: true,
        type: true,
        subject: true,
      },
    })

    if (!originalMessage) return NextResponse.json({ error: "Message not found" }, { status: 404 })
    if (originalMessage.toEmployeeId !== employeeId) {
      return NextResponse.json({ error: "Not the recipient of this message" }, { status: 403 })
    }

    // Create child reply message
    await prisma.employeeMessage.create({
      data: {
        organizationId: originalMessage.organizationId,
        fromEmployeeId: employeeId,
        toEmployeeId: originalMessage.fromEmployeeId,
        type: originalMessage.type,
        subject: `Re: ${originalMessage.subject}`,
        content,
        parentMessageId: originalMessage.id,
        metadata: data ? { responseData: data } : {},
      },
    })

    // Update original message status
    await prisma.employeeMessage.update({
      where: { id },
      data: {
        status: "completed",
        responseContent: content,
        responseData: data || undefined,
        respondedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to reply to message:", error)
    return NextResponse.json({ error: "Failed to reply" }, { status: 500 })
  }
}
