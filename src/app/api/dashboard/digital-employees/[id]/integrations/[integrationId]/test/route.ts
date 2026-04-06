import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  isServiceError,
  testDigitalEmployeeIntegration,
} from "@/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string; integrationId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, integrationId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const result = await testDigitalEmployeeIntegration({
      id,
      organizationId: orgContext?.organizationId ?? null,
      integrationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to test integration:", error)
    return NextResponse.json({ error: "Failed to test integration" }, { status: 500 })
  }
}
