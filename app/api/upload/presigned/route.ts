import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { PresignedUploadBodySchema } from "@/src/features/platform-routes/upload/schema"
import { createPresignedUpload } from "@/src/features/platform-routes/upload/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

/**
 * POST /api/upload/presigned - Get a presigned URL for direct client-side upload
 *
 * Body: {
 *   filename: string,
 *   contentType: string,
 *   size: number,
 *   type: "document" | "logo" | "avatar" | "attachment",
 *   targetId?: string
 * }
 *
 * Returns: { uploadUrl, key, expiresAt }
 */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const payload =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : {}
    const { filename, contentType, size, type } = payload

    if (!filename || !contentType || !size || !type) {
      return NextResponse.json(
        { error: "Missing required fields: filename, contentType, size, type" },
        { status: 400 }
      )
    }

    if (!["document", "logo", "avatar", "attachment"].includes(String(type))) {
      return NextResponse.json(
        { error: "Invalid upload type. Must be: document, logo, avatar, or attachment" },
        { status: 400 }
      )
    }

    const parsedBody = PresignedUploadBodySchema.safeParse(payload)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Missing required fields: filename, contentType, size, type" },
        { status: 400 }
      )
    }

    const orgContext = await getOrganizationContext(request, session.user.id)
    const result = await createPresignedUpload({
      userId: session.user.id,
      input: parsedBody.data,
      organizationContext: orgContext,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Presigned Upload API] Error:", error)
    return NextResponse.json({ error: "Failed to generate presigned URL" }, { status: 500 })
  }
}
