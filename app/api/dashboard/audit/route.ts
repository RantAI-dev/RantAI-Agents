import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  listDashboardAuditLogs,
  type ServiceError,
} from "@/src/features/audit/service"
import { DashboardAuditQuerySchema } from "@/src/features/audit/schema"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

// GET /api/dashboard/audit — query audit logs with filters
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const parsed = DashboardAuditQuerySchema.safeParse({
      employeeId: searchParams.get("employeeId") || undefined,
      action: searchParams.get("action") || undefined,
      riskLevel: searchParams.get("riskLevel") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 })
    }

    const result = await listDashboardAuditLogs({
      context: {
        organizationId: orgContext.organizationId,
        role: orgContext.membership.role,
      },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch audit logs:", error)
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 })
  }
}
