import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST - VM heartbeat
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const { id } = await params

    if (employeeId !== id) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 })
    }

    const result = await prisma.digitalEmployee.updateMany({
      where: { id },
      data: { lastActiveAt: new Date() },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Heartbeat failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
