import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { DashboardDigitalEmployeeIdParamsSchema } from "@/src/features/digital-employees/employees/schema"
import {
  getDashboardDigitalEmployeeVncUrl,
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
    const result = await getDashboardDigitalEmployeeVncUrl({
      id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("VNC URL lookup failed:", error)
    return NextResponse.json({ error: "VNC lookup failed" }, { status: 500 })
  }
}
