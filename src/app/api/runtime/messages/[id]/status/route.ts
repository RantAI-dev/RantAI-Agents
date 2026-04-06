import { NextRequest, NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import {
  RuntimeMessageParamsSchema,
  RuntimeMessageStatusQuerySchema,
} from "@/features/runtime/messages/schema"
import { getRuntimeMessageStatus } from "@/features/runtime/messages/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const parsedParams = RuntimeMessageParamsSchema.safeParse(await params)
    if (!parsedParams.success || !parsedParams.data.id) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const parsedQuery = RuntimeMessageStatusQuerySchema.safeParse({
      employeeId: req.nextUrl.searchParams.get("employeeId") ?? undefined,
    })
    if (!parsedQuery.success || !parsedQuery.data.employeeId) {
      return NextResponse.json({ error: "employeeId query param required" }, { status: 400 })
    }

    const result = await getRuntimeMessageStatus(parsedParams.data.id, parsedQuery.data.employeeId)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to check message status:", error)
    return NextResponse.json({ error: "Failed to check message status" }, { status: 500 })
  }
}
