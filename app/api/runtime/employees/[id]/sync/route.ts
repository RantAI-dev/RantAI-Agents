import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeEmployeeIdParamsSchema, RuntimeEmployeeSyncSchema } from "@/src/features/runtime/employees/schema"
import { syncRuntimeEmployeeFiles } from "@/src/features/runtime/employees/service"
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

    const { employeeId } = await verifyRuntimeToken(token)
    const parsedParams = RuntimeEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success || !parsedParams.data.id) {
      return NextResponse.json({ error: "Sync failed" }, { status: 500 })
    }

    if (employeeId !== parsedParams.data.id) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 })
    }

    const parsedBody = RuntimeEmployeeSyncSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Sync failed" }, { status: 500 })
    }

    const result = await syncRuntimeEmployeeFiles({
      employeeId: parsedParams.data.id,
      updatedBy: "container-sync",
      input: parsedBody.data,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("File sync failed:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}
