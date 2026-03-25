import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeToolExecuteSchema } from "@/src/features/runtime/tools-execute/schema"
import { executeRuntimeTool } from "@/src/features/runtime/tools-execute/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// POST - Agent executes a platform tool from inside the container
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const parsed = RuntimeToolExecuteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = await executeRuntimeTool(employeeId, parsed.data)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Runtime tool execute failed:", error)
    const msg = error instanceof Error ? error.message : "Execution failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
