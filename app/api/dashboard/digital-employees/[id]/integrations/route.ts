import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeIntegrationCreateSchema,
} from "@/src/features/digital-employees/interactions/schema"
import {
  connectDigitalEmployeeIntegration,
  isServiceError,
  listDigitalEmployeeIntegrations,
} from "@/src/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const integrations = await listDigitalEmployeeIntegrations({
      id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(integrations)) {
      return NextResponse.json({ error: integrations.error }, { status: integrations.status })
    }
    return NextResponse.json(integrations)
  } catch (error) {
    console.error("Failed to fetch integrations:", error)
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = DashboardDigitalEmployeeIntegrationCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const integration = await connectDigitalEmployeeIntegration({
      id,
      organizationId: orgContext?.organizationId ?? null,
      userId: session.user.id,
      employeeOrganizationId: orgContext?.organizationId ?? null,
      input: parsed.data,
    })
    if (isServiceError(integration)) {
      return NextResponse.json({ error: integration.error }, { status: integration.status })
    }

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Failed to connect integration:", error)
    return NextResponse.json({ error: "Failed to connect integration" }, { status: 500 })
  }
}
