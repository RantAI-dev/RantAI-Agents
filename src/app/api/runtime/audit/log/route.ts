import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeAuditLogSchema } from "@/features/runtime/audit-log/schema"
import { logRuntimeAudit } from "@/features/runtime/audit-log/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// POST /api/runtime/audit/log — agent writes an audit entry
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const parsed = RuntimeAuditLogSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "action and resource are required" }, { status: 400 })
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null

    const result = await logRuntimeAudit({
      employeeId,
      input: parsed.data,
      ipAddress,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Runtime audit log failed:", error)
    return NextResponse.json({ error: "Failed to log audit entry" }, { status: 500 })
  }
}
