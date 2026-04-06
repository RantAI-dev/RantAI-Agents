import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeActivityQuerySchema,
  DashboardDigitalEmployeeIdParamsSchema,
} from "@/features/digital-employees/employees/schema"
import {
  isServiceError,
  listDashboardDigitalEmployeeActivity,
} from "@/features/digital-employees/employees/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = DashboardDigitalEmployeeActivityQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries())
    )
    const result = await listDashboardDigitalEmployeeActivity({
      id,
      organizationId: orgContext?.organizationId ?? null,
      input: parsed,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch activity:", error)
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 })
  }
}
