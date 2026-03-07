import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const { id } = await params
    const employeeId = req.nextUrl.searchParams.get("employeeId")

    if (!employeeId) {
      return NextResponse.json({ error: "employeeId query param required" }, { status: 400 })
    }

    const message = await prisma.employeeMessage.findUnique({
      where: { id },
      select: {
        id: true,
        fromEmployeeId: true,
        status: true,
        responseContent: true,
        responseData: true,
        respondedAt: true,
      },
    })

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    // Verify the caller is the sender of this message
    if (message.fromEmployeeId !== employeeId) {
      return NextResponse.json({ error: "Not authorized to view this message" }, { status: 403 })
    }

    return NextResponse.json({
      status: message.status,
      responseContent: message.responseContent,
      responseData: message.responseData,
      respondedAt: message.respondedAt,
    })
  } catch (error) {
    console.error("Failed to check message status:", error)
    return NextResponse.json({ error: "Failed to check message status" }, { status: 500 })
  }
}
