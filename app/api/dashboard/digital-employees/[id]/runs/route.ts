import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeIdParamsSchema,
  DigitalEmployeeRunsQuerySchema,
} from "@/src/features/digital-employees/runs/schema"
import {
  listDigitalEmployeeRuns,
} from "@/src/features/digital-employees/runs/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsedQuery = DigitalEmployeeRunsQuerySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams.entries())
    )
    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 })
    }

    const runs = await listDigitalEmployeeRuns({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      limit: Math.min(parseInt(parsedQuery.data.limit || "50", 10), 100),
    })
    if (isHttpServiceError(runs)) {
      return NextResponse.json({ error: runs.error }, { status: runs.status })
    }

    return NextResponse.json(runs)
  } catch (error) {
    console.error("Failed to fetch runs:", error)
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 })
  }
}
