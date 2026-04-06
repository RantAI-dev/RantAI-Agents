import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { UploadFormFieldsSchema } from "@/features/platform-routes/upload/schema"
import { uploadMultipartFile } from "@/features/platform-routes/upload/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

/**
 * POST /api/upload - Universal file upload endpoint
 *
 * Accepts multipart/form-data with:
 * - file: File (required)
 * - type: "document" | "logo" | "avatar" | "attachment" (required)
 * - targetId: string (optional - documentId, orgId, or sessionId depending on type)
 *
 * Returns: { key, url, filename, contentType, size }
 */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    const parsedFields = UploadFormFieldsSchema.safeParse({
      type: formData.get("type"),
      targetId: formData.get("targetId") || undefined,
    })

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!parsedFields.success) {
      return NextResponse.json(
        { error: "Invalid upload type. Must be: document, logo, avatar, or attachment" },
        { status: 400 }
      )
    }

    const orgContext = await getOrganizationContext(request, session.user.id)
    const result = await uploadMultipartFile({
      userId: session.user.id,
      file,
      type: parsedFields.data.type,
      targetId: parsedFields.data.targetId,
      organizationContext: orgContext,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Upload API] Error:", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
