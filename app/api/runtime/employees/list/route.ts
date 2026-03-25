import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeEmployeeListQuerySchema } from "@/src/features/runtime/employees/schema"
import { listRuntimeEmployees } from "@/src/features/runtime/employees/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const parsed = RuntimeEmployeeListQuerySchema.safeParse({
      employeeId: new URL(req.url).searchParams.get("employeeId") ?? undefined,
    })
    if (!parsed.success || !parsed.data.employeeId) {
      return NextResponse.json({ error: "employeeId required" }, { status: 400 })
    }

    const result = await listRuntimeEmployees(parsed.data.employeeId)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ employees: result })
  } catch (error) {
    console.error("Failed to list employees:", error)
    return NextResponse.json({ error: "Failed to list employees" }, { status: 500 })
  }
}
