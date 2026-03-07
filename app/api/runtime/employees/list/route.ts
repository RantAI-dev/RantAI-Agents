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

    // Get caller's org
    const caller = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      select: { organizationId: true },
    })
    if (!caller) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

    // List coworkers in same org (exclude self, only active-ish statuses)
    const employees = await prisma.digitalEmployee.findMany({
      where: {
        organizationId: caller.organizationId,
        id: { not: employeeId },
        status: { in: ["ACTIVE", "PAUSED", "ONBOARDING"] },
      },
      select: {
        id: true,
        name: true,
        description: true,
        avatar: true,
        status: true,
        autonomyLevel: true,
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({ employees })
  } catch (error) {
    console.error("Failed to list employees:", error)
    return NextResponse.json({ error: "Failed to list employees" }, { status: 500 })
  }
}
