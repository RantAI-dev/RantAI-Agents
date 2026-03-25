import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  isServiceError,
  listDigitalEmployeeTools,
} from "@/src/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await listDigitalEmployeeTools({
      id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch tools:", error)
    return NextResponse.json({ error: "Failed to fetch tools" }, { status: 500 })
  }
}
