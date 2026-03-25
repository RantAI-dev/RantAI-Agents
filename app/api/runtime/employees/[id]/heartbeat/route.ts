import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeEmployeeIdParamsSchema } from "@/src/features/runtime/employees/schema"
import { heartbeatRuntimeEmployee } from "@/src/features/runtime/employees/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let employeeId: string
    try {
      const verified = await verifyRuntimeToken(token)
      employeeId = verified.employeeId
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === "ERR_JWT_EXPIRED") {
        return NextResponse.json({ error: "Token expired" }, { status: 401 })
      }
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const parsedParams = RuntimeEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success || !parsedParams.data.id) {
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }

    if (employeeId !== parsedParams.data.id) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 })
    }

    const result = await heartbeatRuntimeEmployee(parsedParams.data.id)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Heartbeat failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
