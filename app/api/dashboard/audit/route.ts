import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"

// GET /api/dashboard/audit — query audit logs with filters
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "audit.read")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")
    const action = searchParams.get("action")
    const riskLevel = searchParams.get("riskLevel")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const cursor = searchParams.get("cursor")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)

    const where: Record<string, unknown> = {
      organizationId: orgContext.organizationId,
    }

    if (employeeId) where.employeeId = employeeId
    if (action) where.action = action
    if (riskLevel) where.riskLevel = riskLevel
    if (from || to) {
      const createdAt: Record<string, Date> = {}
      if (from) createdAt.gte = new Date(from)
      if (to) createdAt.lte = new Date(to)
      where.createdAt = createdAt
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = logs.length > limit
    if (hasMore) logs.pop()

    const nextCursor = hasMore && logs.length > 0 ? logs[logs.length - 1].id : null

    return NextResponse.json({
      items: logs,
      nextCursor,
      hasMore,
    })
  } catch (error) {
    console.error("Failed to fetch audit logs:", error)
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 })
  }
}
