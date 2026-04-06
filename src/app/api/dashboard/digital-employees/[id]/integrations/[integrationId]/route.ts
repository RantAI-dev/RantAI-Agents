import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeIntegrationUpdateSchema,
} from "@/features/digital-employees/interactions/schema"
import {
  deleteDigitalEmployeeIntegrationForDashboard,
  isServiceError,
  updateDigitalEmployeeIntegrationForDashboard,
} from "@/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string; integrationId: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, integrationId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = DashboardDigitalEmployeeIntegrationUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const integration = await updateDigitalEmployeeIntegrationForDashboard({
      id,
      organizationId: orgContext?.organizationId ?? null,
      integrationId,
      input: parsed.data,
    })
    if (isServiceError(integration)) {
      return NextResponse.json({ error: integration.error }, { status: integration.status })
    }

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Failed to update integration:", error)
    return NextResponse.json({ error: "Failed to update integration" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, integrationId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await deleteDigitalEmployeeIntegrationForDashboard({
      id,
      organizationId: orgContext?.organizationId ?? null,
      integrationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to disconnect integration:", error)
    return NextResponse.json({ error: "Failed to disconnect integration" }, { status: 500 })
  }
}
