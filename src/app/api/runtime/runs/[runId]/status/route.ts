import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeRunParamsSchema, RuntimeRunStatusSchema } from "@/features/runtime/runs/schema"
import { reportRuntimeRunStatus } from "@/features/runtime/runs/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ runId: string }>
}

// POST - VM reports run status
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { runId: tokenRunId } = await verifyRuntimeToken(token)
    const parsedParams = RuntimeRunParamsSchema.safeParse(await params)
    if (!parsedParams.success || !parsedParams.data.runId) {
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }

    if (tokenRunId !== parsedParams.data.runId) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 })
    }

    const parsedBody = RuntimeRunStatusSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }

    const result = await reportRuntimeRunStatus({
      runId: parsedParams.data.runId,
      input: parsedBody.data,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Runtime status update failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
