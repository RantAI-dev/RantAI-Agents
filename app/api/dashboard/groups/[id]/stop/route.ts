import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { DashboardGroupIdParamsSchema } from "@/src/features/digital-employees/groups/schema"
import { stopGroupForDashboard } from "@/src/features/digital-employees/groups/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardGroupIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const result = await stopGroupForDashboard({
      groupId: parsedParams.data.id,
      context: {
        organizationId: orgContext.organizationId,
        role: orgContext.membership.role,
        userId: session.user.id,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Stop group container failed:", error)
    const message = error instanceof Error ? error.message : "Stop failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
