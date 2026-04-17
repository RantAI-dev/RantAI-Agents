import { NextResponse } from "next/server"
import { getUserId } from "@/lib/get-user-id"
import {
  OrganizationDetailParamsSchema,
  UpdateOrganizationSchema,
} from "@/features/organizations/detail/schema"
import {
  deleteOrganizationDetail,
  getOrganizationDetail,
  updateOrganizationDetail,
} from "@/features/organizations/detail/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// GET /api/organizations/[id] - Get organization details
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationDetailParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const organization = await getOrganizationDetail({
      actorUserId: userId,
      organizationId: parsedParams.data.id,
    })
    if (isHttpServiceError(organization)) {
      return NextResponse.json({ error: organization.error }, { status: organization.status })
    }

    return NextResponse.json(organization)
  } catch (error) {
    console.error("[Organization API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    )
  }
}

// PATCH /api/organizations/[id] - Update organization
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationDetailParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const parsedBody = UpdateOrganizationSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const organization = await updateOrganizationDetail({
      actorUserId: userId,
      organizationId: parsedParams.data.id,
      input: parsedBody.data,
    })
    if (isHttpServiceError(organization)) {
      return NextResponse.json({ error: organization.error }, { status: organization.status })
    }

    return NextResponse.json(organization)
  } catch (error) {
    console.error("[Organization API] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    )
  }
}

// DELETE /api/organizations/[id] - Delete organization
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationDetailParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const result = await deleteOrganizationDetail({
      actorUserId: userId,
      organizationId: parsedParams.data.id,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Organization API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete organization" },
      { status: 500 }
    )
  }
}
