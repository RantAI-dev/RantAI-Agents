import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  DashboardGroupCreateBodySchema,
} from "@/src/features/digital-employees/groups/schema"
import {
  createGroupForDashboard,
  listGroupsForDashboard,
} from "@/src/features/digital-employees/groups/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const result = await listGroupsForDashboard(orgContext.organizationId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch groups:", error)
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const parsedBody = DashboardGroupCreateBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const result = await createGroupForDashboard({
      context: {
        organizationId: orgContext.organizationId,
        role: orgContext.membership.role,
        userId: session.user.id,
      },
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("Failed to create group:", error)
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 })
  }
}
