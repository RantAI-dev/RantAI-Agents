import { fileExists, getFileMetadata, getPresignedDownloadUrl } from "@/lib/s3"
import { findDashboardSessionOwner } from "./repository"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Validates access and returns either redirect instructions or presigned file metadata.
 */
export async function accessFileByKey(params: {
  s3Key: string
  userId: string
  organizationId: string | null
  shouldRedirect: boolean
  forceDownload: boolean
}) {
  const exists = await fileExists(params.s3Key)
  if (!exists) {
    return { status: 404, error: "File not found" } satisfies ServiceError
  }

  const hasAccess = await verifyFileAccess(params)
  if (!hasAccess) {
    return { status: 403, error: "Access denied" } satisfies ServiceError
  }

  const metadata = await getFileMetadata(params.s3Key)
  const presignedUrl = await getPresignedDownloadUrl(params.s3Key)

  return {
    shouldRedirect: params.shouldRedirect,
    url: presignedUrl,
    filename: params.s3Key.split("/").pop() || "file",
    contentType: metadata?.contentType || "application/octet-stream",
    size: metadata?.contentLength,
    expiresAt: new Date(Date.now() + 7200 * 1000).toISOString(),
  }
}

async function verifyFileAccess(params: {
  s3Key: string
  userId: string
  organizationId: string | null
  forceDownload: boolean
}): Promise<boolean> {
  void params.forceDownload

  const parts = params.s3Key.split("/")
  const resourceType = parts[0]

  switch (resourceType) {
    case "documents": {
      const orgId = parts[1]
      if (orgId === "global") return true
      return params.organizationId === orgId
    }

    case "organizations": {
      const orgId = parts[1]
      return params.organizationId === orgId
    }

    case "users":
      return true

    case "chat": {
      const sessionId = parts[1]
      const session = await findDashboardSessionOwner(sessionId)
      return session?.userId === params.userId
    }

    case "temp":
      return true

    default:
      return false
  }
}
