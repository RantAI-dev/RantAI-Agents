import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { DashboardDigitalEmployeeIdParamsSchema } from "@/src/features/digital-employees/employees/schema"
import {
  exportDashboardDigitalEmployeeData,
  isServiceError,
} from "@/src/features/digital-employees/employees/service"

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
    const result = await exportDashboardDigitalEmployeeData({
      id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return new NextResponse(JSON.stringify(result.data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    })
  } catch (error) {
    console.error("Failed to export employee data:", error)
    return NextResponse.json({ error: "Failed to export employee data" }, { status: 500 })
  }
}
