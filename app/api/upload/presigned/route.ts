import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit, canManage } from "@/lib/organization"
import {
  getPresignedUploadUrl,
  S3Paths,
  validateUpload,
  type UploadType,
} from "@/lib/s3"

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
    const { filename, contentType, size, type, targetId } = body

    if (!filename || !contentType || !size || !type) {
      return NextResponse.json(
        { error: "Missing required fields: filename, contentType, size, type" },
        { status: 400 }
      )
    }

    if (!["document", "logo", "avatar", "attachment"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid upload type. Must be: document, logo, avatar, or attachment" },
        { status: 400 }
      )
    }

    // Validate file size and type
    const validation = validateUpload(type as UploadType, size, contentType)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Get organization context
    const orgContext = await getOrganizationContext(request, session.user.id)

    // Generate S3 key based on upload type
    let s3Key: string
    const fileId = crypto.randomUUID()

    switch (type) {
      case "document": {
        if (orgContext && !canEdit(orgContext.membership.role)) {
          return NextResponse.json(
            { error: "Insufficient permissions to upload documents" },
            { status: 403 }
          )
        }
        const docId = targetId || fileId
        s3Key = S3Paths.document(orgContext?.organizationId || null, docId, filename)
        break
      }

      case "logo": {
        if (!orgContext) {
          return NextResponse.json(
            { error: "Organization context required for logo upload" },
            { status: 400 }
          )
        }
        if (!canManage(orgContext.membership.role)) {
          return NextResponse.json(
            { error: "Only admins can update organization logo" },
            { status: 403 }
          )
        }
        s3Key = S3Paths.organizationLogo(orgContext.organizationId, filename)
        break
      }

      case "avatar": {
        s3Key = S3Paths.userAvatar(session.user.id, filename)
        break
      }

      case "attachment": {
        if (!targetId) {
          return NextResponse.json(
            { error: "Session ID (targetId) required for attachment upload" },
            { status: 400 }
          )
        }

        // Verify user owns the session
        const chatSession = await prisma.dashboardSession.findUnique({
          where: { id: targetId },
          select: { userId: true },
        })

        if (!chatSession || chatSession.userId !== session.user.id) {
          return NextResponse.json(
            { error: "Session not found or access denied" },
            { status: 404 }
          )
        }

        const messageId = fileId
        s3Key = S3Paths.chatAttachment(targetId, messageId, filename)
        break
      }

      default:
        return NextResponse.json({ error: "Invalid upload type" }, { status: 400 })
    }

    // Generate presigned upload URL (expires in 1 hour)
    const expiresIn = 3600
    const uploadUrl = await getPresignedUploadUrl(s3Key, contentType, expiresIn)
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    return NextResponse.json({
      uploadUrl,
      key: s3Key,
      expiresAt,
    })
  } catch (error) {
    console.error("[Presigned Upload API] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    )
  }
}
