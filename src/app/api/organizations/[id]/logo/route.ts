import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  OrganizationLogoParamsSchema,
  UploadOrganizationLogoFormSchema,
} from "@/features/organizations/logo/schema"
import {
  deleteOrganizationLogo,
  getOrganizationLogo,
  uploadOrganizationLogo,
} from "@/features/organizations/logo/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

/**
 * POST /api/organizations/[id]/logo - Upload organization logo
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationLogoParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const formData = await request.formData()
    const parsedForm = UploadOrganizationLogoFormSchema.safeParse({
      file: formData.get("file"),
    })
    if (!parsedForm.success) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const context = await getOrganizationContext(request, session.user.id)
    const result = await uploadOrganizationLogo({
      organizationId: parsedParams.data.id,
      actorUserId: session.user.id,
      context: {
        organizationId: context?.organizationId ?? null,
        role: context?.membership.role ?? null,
      },
      file: parsedForm.data.file,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Logo API] Upload error:", error)
    return NextResponse.json(
      { error: "Failed to upload logo" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/organizations/[id]/logo - Get organization logo URL
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationLogoParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const context = await getOrganizationContext(request, session.user.id)
    const result = await getOrganizationLogo({
      organizationId: parsedParams.data.id,
      context: {
        organizationId: context?.organizationId ?? null,
        role: context?.membership.role ?? null,
      },
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Logo API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get logo" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/organizations/[id]/logo - Remove organization logo
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationLogoParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const context = await getOrganizationContext(request, session.user.id)
    const result = await deleteOrganizationLogo({
      organizationId: parsedParams.data.id,
      context: {
        organizationId: context?.organizationId ?? null,
        role: context?.membership.role ?? null,
      },
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Logo API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete logo" },
      { status: 500 }
    )
  }
}
