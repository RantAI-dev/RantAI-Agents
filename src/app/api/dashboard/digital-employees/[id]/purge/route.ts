import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeIdParamsSchema,
  DashboardDigitalEmployeePurgeBodySchema,
} from "@/features/digital-employees/employees/schema"
import {
  isServiceError,
  purgeDashboardDigitalEmployeeData,
} from "@/features/digital-employees/employees/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = DashboardDigitalEmployeePurgeBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await purgeDashboardDigitalEmployeeData({
      id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to purge employee data:", error)
    return NextResponse.json({ error: "Failed to purge employee data" }, { status: 500 })
  }
}
