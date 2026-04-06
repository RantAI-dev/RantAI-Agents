import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  deleteDashboardTemplateForDashboard,
  updateDashboardTemplateForDashboard,
  type ServiceError,
} from "@/features/templates/service"
import {
  DashboardTemplateIdParamsSchema,
  DashboardTemplateUpdateBodySchema,
} from "@/features/templates/schema"

interface RouteParams {
  params: Promise<{ id: string }>
}

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

// PUT /api/dashboard/templates/:id
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const parsedParams = DashboardTemplateIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const parsedBody = DashboardTemplateUpdateBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
    }

    const updated = await updateDashboardTemplateForDashboard({
      templateId: parsedParams.data.id,
      context: {
        organizationId: orgContext.organizationId,
        role: orgContext.membership.role,
        userId: session.user.id,
      },
      input: parsedBody.data,
    })
    if (isServiceError(updated)) {
      return NextResponse.json({ error: updated.error }, { status: updated.status })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update template:", error)
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}

// DELETE /api/dashboard/templates/:id
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const parsedParams = DashboardTemplateIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const deleted = await deleteDashboardTemplateForDashboard({
      templateId: parsedParams.data.id,
      context: {
        organizationId: orgContext.organizationId,
        role: orgContext.membership.role,
        userId: session.user.id,
      },
    })
    if (isServiceError(deleted)) {
      return NextResponse.json({ error: deleted.error }, { status: deleted.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete template:", error)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}
