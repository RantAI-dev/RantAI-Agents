import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { logAudit, classifyActionRisk } from "@/lib/digital-employee/audit"

// POST /api/runtime/audit/log — agent writes an audit entry
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)

    const body = await req.json()
    const { action, resource, detail, riskLevel } = body

    if (!action || !resource) {
      return NextResponse.json(
        { error: "action and resource are required" },
        { status: 400 }
      )
    }

    // Look up employee's organizationId
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      select: { organizationId: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null

    await logAudit({
      organizationId: employee.organizationId,
      employeeId,
      action,
      resource,
      detail: detail || {},
      ipAddress: ipAddress || undefined,
      riskLevel: riskLevel || classifyActionRisk(action),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Runtime audit log failed:", error)
    return NextResponse.json({ error: "Failed to log audit entry" }, { status: 500 })
  }
}
