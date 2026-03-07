import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")
    if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 })

    const messages = await prisma.employeeMessage.findMany({
      where: {
        toEmployeeId: employeeId,
        status: { in: ["pending", "delivered"] },
      },
      include: {
        fromEmployee: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    // Mark pending messages as delivered
    const pendingIds = messages.filter((m) => m.status === "pending").map((m) => m.id)
    if (pendingIds.length > 0) {
      await prisma.employeeMessage.updateMany({
        where: { id: { in: pendingIds } },
        data: { status: "delivered" },
      })
    }

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Failed to fetch inbox:", error)
    return NextResponse.json({ error: "Failed to fetch inbox" }, { status: 500 })
  }
}
