import { canEdit, canManage, type OrganizationContext } from "@/lib/organization"
import {
  S3Paths,
  getPresignedUploadUrl,
  uploadFile,
  validateUpload,
} from "@/lib/s3"
import {
  createFileAttachment,
  findDashboardSessionOwner,
  updateOrganizationLogo,
  updateUserAvatar,
} from "./repository"
import type { PresignedUploadBody, UploadType } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface UploadFileLike {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

function isAllowedUploadType(type: string): type is UploadType {
  return ["document", "logo", "avatar", "attachment"].includes(type)
}

/**
 * Resolves and validates S3 key authorization for all supported upload types.
 */
async function resolveUploadKey(params: {
  userId: string
  type: UploadType
  filename: string
  targetId?: string
  organizationContext: OrganizationContext | null
  generatedId: string
}): Promise<string | ServiceError> {
  const { userId, type, filename, targetId, organizationContext, generatedId } = params

  switch (type) {
    case "document": {
      if (organizationContext && !canEdit(organizationContext.membership.role)) {
        return { status: 403, error: "Insufficient permissions to upload documents" }
      }

      const documentId = targetId || generatedId
      return S3Paths.document(organizationContext?.organizationId || null, documentId, filename)
    }

    case "logo": {
      if (!organizationContext) {
        return { status: 400, error: "Organization context required for logo upload" }
      }

      if (!canManage(organizationContext.membership.role)) {
        return { status: 403, error: "Only admins can update organization logo" }
      }

      return S3Paths.organizationLogo(organizationContext.organizationId, filename)
    }

    case "avatar":
      return S3Paths.userAvatar(userId, filename)

    case "attachment": {
      if (!targetId) {
        return { status: 400, error: "Session ID (targetId) required for attachment upload" }
      }

      const chatSession = await findDashboardSessionOwner(targetId)
      if (!chatSession || chatSession.userId !== userId) {
        return { status: 404, error: "Session not found or access denied" }
      }

      const messageId = generatedId
      return S3Paths.chatAttachment(targetId, messageId, filename)
    }

    default:
      return { status: 400, error: "Invalid upload type" }
  }
}

/**
 * Handles server-side multipart upload and post-upload record updates.
 */
export async function uploadMultipartFile(params: {
  userId: string
  file: UploadFileLike
  type: string
  targetId?: string
  organizationContext: OrganizationContext | null
}) {
  if (!isAllowedUploadType(params.type)) {
    return {
      status: 400,
      error: "Invalid upload type. Must be: document, logo, avatar, or attachment",
    } satisfies ServiceError
  }

  const validation = validateUpload(params.type, params.file.size, params.file.type)
  if (!validation.valid) {
    return { status: 400, error: validation.error || "Invalid file" } satisfies ServiceError
  }

  const fileId = crypto.randomUUID()
  const s3KeyOrError = await resolveUploadKey({
    userId: params.userId,
    type: params.type,
    filename: params.file.name,
    targetId: params.targetId,
    organizationContext: params.organizationContext,
    generatedId: fileId,
  })

  if (typeof s3KeyOrError !== "string") {
    return s3KeyOrError
  }

  const arrayBuffer = await params.file.arrayBuffer()
  const result = await uploadFile(
    s3KeyOrError,
    Buffer.from(arrayBuffer),
    params.file.type,
    {
      originalFilename: params.file.name,
      uploadedBy: params.userId,
      uploadType: params.type,
    }
  )

  if (params.type === "logo" && params.organizationContext) {
    await updateOrganizationLogo(params.organizationContext.organizationId, s3KeyOrError)
  }

  if (params.type === "avatar") {
    await updateUserAvatar(params.userId, s3KeyOrError).catch(() => {
      // Some users may not have a mutable profile record in all environments.
    })
  }

  if (params.type === "attachment") {
    await createFileAttachment({
      s3Key: s3KeyOrError,
      filename: params.file.name,
      contentType: params.file.type,
      size: params.file.size,
      uploadedBy: params.userId,
    })
  }

  return {
    key: result.key,
    url:
      params.type === "avatar"
        ? `/api/admin/profile/avatar?t=${Date.now()}`
        : result.url,
    filename: params.file.name,
    contentType: params.file.type,
    size: result.size,
  }
}

/**
 * Generates a direct-upload presigned URL with the same access rules as multipart upload.
 */
export async function createPresignedUpload(params: {
  userId: string
  input: PresignedUploadBody
  organizationContext: OrganizationContext | null
}) {
  const validation = validateUpload(params.input.type, params.input.size, params.input.contentType)
  if (!validation.valid) {
    return { status: 400, error: validation.error || "Invalid file" } satisfies ServiceError
  }

  const s3KeyOrError = await resolveUploadKey({
    userId: params.userId,
    type: params.input.type,
    filename: params.input.filename,
    targetId: params.input.targetId,
    organizationContext: params.organizationContext,
    generatedId: crypto.randomUUID(),
  })

  if (typeof s3KeyOrError !== "string") {
    return s3KeyOrError
  }

  const expiresIn = 3600
  const uploadUrl = await getPresignedUploadUrl(s3KeyOrError, params.input.contentType, expiresIn)

  return {
    uploadUrl,
    key: s3KeyOrError,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
}
