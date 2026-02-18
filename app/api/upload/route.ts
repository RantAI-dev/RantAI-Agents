import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit, canManage } from "@/lib/organization"
import {
  uploadFile,
  S3Paths,
  validateUpload,
  type UploadType,
} from "@/lib/s3"

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
    const file = formData.get("file") as File | null
    const type = formData.get("type") as UploadType | null
    const targetId = formData.get("targetId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!type || !["document", "logo", "avatar", "attachment"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid upload type. Must be: document, logo, avatar, or attachment" },
        { status: 400 }
      )
    }

    // Validate file size and type
    const validation = validateUpload(type, file.size, file.type)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Get organization context for document and logo uploads
    const orgContext = await getOrganizationContext(request, session.user.id)

    // Generate S3 key based on upload type
    let s3Key: string
    const fileId = crypto.randomUUID()

    switch (type) {
      case "document": {
        // For documents, require edit permission if in org context
        if (orgContext && !canEdit(orgContext.membership.role)) {
          return NextResponse.json(
            { error: "Insufficient permissions to upload documents" },
            { status: 403 }
          )
        }
        const docId = targetId || fileId
        s3Key = S3Paths.document(orgContext?.organizationId || null, docId, file.name)
        break
      }

      case "logo": {
        // Logo upload requires organization admin
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
        s3Key = S3Paths.organizationLogo(orgContext.organizationId, file.name)
        break
      }

      case "avatar": {
        // Avatar upload - user can only upload their own
        s3Key = S3Paths.userAvatar(session.user.id, file.name)
        break
      }

      case "attachment": {
        // Chat attachment - require session context
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

        const messageId = fileId // Will be used as message ID if creating new message
        s3Key = S3Paths.chatAttachment(targetId, messageId, file.name)
        break
      }

      default:
        return NextResponse.json({ error: "Invalid upload type" }, { status: 400 })
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to S3
    const result = await uploadFile(s3Key, buffer, file.type, {
      originalFilename: file.name,
      uploadedBy: session.user.id,
      uploadType: type,
    })

    // For logo uploads, update the organization
    if (type === "logo" && orgContext) {
      await prisma.organization.update({
        where: { id: orgContext.organizationId },
        data: { logoS3Key: s3Key },
      })
    }

    // For avatar uploads, update the agent
    if (type === "avatar") {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { avatarS3Key: s3Key },
      }).catch(() => {
        // User might not be an agent, that's ok
      })
    }

    // For attachment uploads, create FileAttachment record
    if (type === "attachment") {
      await prisma.fileAttachment.create({
        data: {
          s3Key,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          uploadedBy: session.user.id,
          // messageId will be set later when message is created
        },
      })
    }

    return NextResponse.json({
      key: result.key,
      url: result.url,
      filename: file.name,
      contentType: file.type,
      size: result.size,
    })
  } catch (error) {
    console.error("[Upload API] Error:", error)
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    )
  }
}
