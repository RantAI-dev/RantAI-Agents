import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { getPresignedDownloadUrl, fileExists, getFileMetadata } from "@/lib/s3"

/**
 * GET /api/files/[...key] - Get file access URL or redirect to presigned URL
 *
 * The key is the full S3 path, e.g., /api/files/documents/org123/doc456/file.pdf
 *
 * Query params:
 * - redirect=true (default): Redirect to presigned URL
 * - redirect=false: Return JSON with presigned URL
 * - download=true: Force download (Content-Disposition: attachment)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { key: keyParts } = await params
    const s3Key = keyParts.join("/")

    if (!s3Key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 })
    }

    // Parse query params
    const url = new URL(request.url)
    const shouldRedirect = url.searchParams.get("redirect") !== "false"
    const forceDownload = url.searchParams.get("download") === "true"

    // Verify file exists
    const exists = await fileExists(s3Key)
    if (!exists) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Check access based on key path
    const hasAccess = await verifyAccess(request, session.user.id, s3Key)
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Get file metadata for response headers
    const metadata = await getFileMetadata(s3Key)

    // Generate presigned URL
    const presignedUrl = await getPresignedDownloadUrl(s3Key)
    const expiresAt = new Date(Date.now() + 7200 * 1000).toISOString()

    if (shouldRedirect) {
      // Redirect to presigned URL
      return NextResponse.redirect(presignedUrl, 302)
    }

    // Return JSON response
    return NextResponse.json({
      url: presignedUrl,
      filename: s3Key.split("/").pop() || "file",
      contentType: metadata?.contentType || "application/octet-stream",
      size: metadata?.contentLength,
      expiresAt,
    })
  } catch (error) {
    console.error("[Files API] Error:", error)
    return NextResponse.json(
      { error: "Failed to access file" },
      { status: 500 }
    )
  }
}

/**
 * Verify user has access to the file based on its S3 key path
 */
async function verifyAccess(
  request: Request,
  userId: string,
  s3Key: string
): Promise<boolean> {
  const parts = s3Key.split("/")
  const resourceType = parts[0]

  switch (resourceType) {
    case "documents": {
      // Path: documents/{orgId|global}/{docId}/{filename}
      const orgId = parts[1]

      if (orgId === "global") {
        // Global documents are accessible to all authenticated users
        return true
      }

      // Verify user is member of the organization
      const orgContext = await getOrganizationContext(request, userId)
      return orgContext?.organizationId === orgId
    }

    case "organizations": {
      // Path: organizations/{orgId}/logo/{filename}
      const orgId = parts[1]

      // Organization logos are public within the org
      const orgContext = await getOrganizationContext(request, userId)
      return orgContext?.organizationId === orgId
    }

    case "users": {
      // Path: users/{userId}/avatar/{filename}
      // Avatars are public (anyone can see anyone's avatar)
      return true
    }

    case "chat": {
      // Path: chat/{sessionId}/{messageId}/{filename}
      const sessionId = parts[1]

      // Verify user owns the session
      const session = await prisma.dashboardSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      })

      return session?.userId === userId
    }

    case "temp": {
      // Temp files - only accessible to the uploader
      // This would require storing uploader info, for now allow authenticated access
      return true
    }

    default:
      // Unknown resource type - deny access
      return false
  }
}
