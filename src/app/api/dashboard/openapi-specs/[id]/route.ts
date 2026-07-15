import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import {
  DashboardOpenApiSpecIdParamsSchema,
} from "@/features/openapi-specs/schema"
import {
  deleteDashboardOpenApiSpec,
  getDashboardOpenApiSpec,
  resyncDashboardOpenApiSpec,
} from "@/features/openapi-specs/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardOpenApiSpecIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Spec not found" }, { status: 404 })
    }

    const orgContext = await resolveActiveOrg(_req, session.user.id)
    const result = await getDashboardOpenApiSpec({
      id: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[OpenAPI API] GET [id] error:", error)
    return NextResponse.json({ error: "Failed to fetch spec" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardOpenApiSpecIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Spec not found" }, { status: 404 })
    }

    const orgContext = await resolveActiveOrg(_req, session.user.id)
    const result = await deleteDashboardOpenApiSpec({
      id: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[OpenAPI API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete spec" }, { status: 500 })
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardOpenApiSpecIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Spec not found" }, { status: 404 })
    }

    const orgContext = await resolveActiveOrg(_req, session.user.id)
    const result = await resyncDashboardOpenApiSpec({
      id: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      createdBy: session.user.id,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[OpenAPI API] POST resync error:", error)
    return NextResponse.json({ error: "Failed to resync" }, { status: 500 })
  }
}
