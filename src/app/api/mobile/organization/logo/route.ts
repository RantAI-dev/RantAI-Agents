import { NextResponse } from "next/server"

import { UploadOrganizationLogoFormSchema } from "@/features/organizations/logo/schema"
import {
  deleteOrganizationLogo,
  getOrganizationLogo,
  uploadOrganizationLogo,
} from "@/features/organizations/logo/service"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/** GET /api/mobile/organization/logo — the active org's logo URL (or null). */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ logoUrl: null })
    }
    const result = await getOrganizationLogo({
      organizationId: ctx.organizationId,
      context: { organizationId: ctx.organizationId, role: ctx.role },
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Org Logo] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch logo" }, { status: 500 })
  }
}

/** POST /api/mobile/organization/logo — upload a logo (owner/admin). multipart `file`. */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const formData = await request.formData()
    const parsedForm = UploadOrganizationLogoFormSchema.safeParse({
      file: formData.get("file"),
    })
    if (!parsedForm.success) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const result = await uploadOrganizationLogo({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      context: { organizationId: ctx.organizationId, role: ctx.role },
      file: parsedForm.data.file,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Org Logo] POST error:", error)
    return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 })
  }
}

/** DELETE /api/mobile/organization/logo — remove the logo (owner/admin). */
export async function DELETE(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }
    const result = await deleteOrganizationLogo({
      organizationId: ctx.organizationId,
      context: { organizationId: ctx.organizationId, role: ctx.role },
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Org Logo] DELETE error:", error)
    return NextResponse.json({ error: "Failed to remove logo" }, { status: 500 })
  }
}
