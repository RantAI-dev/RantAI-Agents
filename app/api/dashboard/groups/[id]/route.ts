import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  DashboardGroupIdParamsSchema,
  DashboardGroupUpdateBodySchema,
} from "@/src/features/digital-employees/groups/schema"
import {
  deleteGroupForDashboard,
  getGroupForDashboard,
  updateGroupForDashboard,
} from "@/src/features/digital-employees/groups/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const result = await getGroupForDashboard({
      groupId: parsedParams.data.id,
      organizationId: orgContext.organizationId,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch group:", error)
    return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const parsedBody = DashboardGroupUpdateBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Failed to update group" }, { status: 400 })
    }

    const result = await updateGroupForDashboard({
      groupId: parsedParams.data.id,
      organizationId: orgContext.organizationId,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to update group:", error)
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 })
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

    const result = await deleteGroupForDashboard({
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
    console.error("Failed to delete group:", error)
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 })
  }
}
