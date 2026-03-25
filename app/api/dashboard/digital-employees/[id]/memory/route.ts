import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeIdParamsSchema,
  DashboardDigitalEmployeeMemoryQuerySchema,
} from "@/src/features/digital-employees/employees/schema"
import {
  isServiceError,
  listDashboardDigitalEmployeeMemoryEntries,
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
    const parsed = DashboardDigitalEmployeeMemoryQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries())
    )
    const result = await listDashboardDigitalEmployeeMemoryEntries({
      id,
      organizationId: orgContext?.organizationId ?? null,
      input: parsed,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch memory:", error)
    return NextResponse.json({ error: "Failed to fetch memory" }, { status: 500 })
  }
}
