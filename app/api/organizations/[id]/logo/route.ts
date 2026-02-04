import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canManage } from "@/lib/organization"
import {
  uploadFile,
  deleteFile,
  S3Paths,
  validateUpload,
  getPresignedDownloadUrl,
} from "@/lib/s3"

/**
 * POST /api/organizations/[id]/logo - Upload organization logo
 *
 * Accepts multipart/form-data with:
 * - file: Image file (PNG, JPEG, SVG, WebP)
 *
 * Returns: { logoUrl, logoS3Key }
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

    const { id: organizationId } = await params

    // Verify organization membership and admin role
    const orgContext = await getOrganizationContext(request, session.user.id)
    if (!orgContext || orgContext.organizationId !== organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    if (!canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Only admins can update organization logo" },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file
    const validation = validateUpload("logo", file.size, file.type)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Get current organization to check for existing logo
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoS3Key: true },
    })

    // Delete existing logo from S3 if present
    if (organization?.logoS3Key) {
      try {
        await deleteFile(organization.logoS3Key)
      } catch (deleteError) {
        console.error("[Logo API] Failed to delete old logo:", deleteError)
        // Continue with upload even if delete fails
      }
    }

    // Upload new logo to S3
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const s3Key = S3Paths.organizationLogo(organizationId, file.name)

    const uploadResult = await uploadFile(s3Key, buffer, file.type, {
      organizationId,
      uploadedBy: session.user.id,
    })

    // Update organization with new logo key
    await prisma.organization.update({
      where: { id: organizationId },
      data: { logoS3Key: s3Key },
    })

    return NextResponse.json({
      logoUrl: uploadResult.url,
      logoS3Key: s3Key,
    })
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
 *
 * Returns: { logoUrl } or 404 if no logo
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

    const { id: organizationId } = await params

    // Verify organization membership
    const orgContext = await getOrganizationContext(request, session.user.id)
    if (!orgContext || orgContext.organizationId !== organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoS3Key: true, logoUrl: true },
    })

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    // Prefer S3 logo, fallback to external URL
    if (organization.logoS3Key) {
      const logoUrl = await getPresignedDownloadUrl(organization.logoS3Key)
      return NextResponse.json({ logoUrl })
    }

    if (organization.logoUrl) {
      return NextResponse.json({ logoUrl: organization.logoUrl })
    }

    return NextResponse.json({ logoUrl: null })
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
 *
 * Returns: { success: true }
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

    const { id: organizationId } = await params

    // Verify organization membership and admin role
    const orgContext = await getOrganizationContext(request, session.user.id)
    if (!orgContext || orgContext.organizationId !== organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    if (!canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Only admins can remove organization logo" },
        { status: 403 }
      )
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoS3Key: true },
    })

    // Delete logo from S3 if present
    if (organization?.logoS3Key) {
      try {
        await deleteFile(organization.logoS3Key)
      } catch (deleteError) {
        console.error("[Logo API] Failed to delete logo from S3:", deleteError)
        // Continue with database update even if S3 delete fails
      }
    }

    // Clear logo fields in database
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        logoS3Key: null,
        logoUrl: null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Logo API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete logo" },
      { status: 500 }
    )
  }
}
