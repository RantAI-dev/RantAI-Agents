import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  DashboardGroupIdParamsSchema,
  DashboardGroupMembersBodySchema,
} from "@/features/digital-employees/groups/schema"
import {
  addGroupMembersForDashboard,
  removeGroupMembersForDashboard,
} from "@/features/digital-employees/groups/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

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
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const parsedBody = DashboardGroupMembersBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "employeeIds must be a non-empty array" },
        { status: 400 }
      )
    }

    const result = await addGroupMembersForDashboard({
      groupId: parsedParams.data.id,
      organizationId: orgContext.organizationId,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to add group members:", error)
    return NextResponse.json({ error: "Failed to add group members" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const parsedBody = DashboardGroupMembersBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "employeeIds must be a non-empty array" },
        { status: 400 }
      )
    }

    const result = await removeGroupMembersForDashboard({
      groupId: parsedParams.data.id,
      organizationId: orgContext.organizationId,
      userId: session.user.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to remove group members:", error)
    return NextResponse.json({ error: "Failed to remove group members" }, { status: 500 })
  }
}
