import { canManage } from "@/lib/organization"
import {
  S3Paths,
  deleteFile,
  getPresignedDownloadUrl,
  uploadFile,
  validateUpload,
} from "@/lib/s3"
import {
  clearOrganizationLogo,
  findOrganizationLogoFields,
  updateOrganizationLogoKey,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface OrganizationContextInput {
  organizationId: string | null
  role: string | null
}

function isOrganizationAccessible(
  organizationId: string,
  context: OrganizationContextInput
): boolean {
  return !!context.organizationId && context.organizationId === organizationId
}

/**
 * Uploads a new organization logo and replaces the old one when present.
 */
export async function uploadOrganizationLogo(params: {
  organizationId: string
  actorUserId: string
  context: OrganizationContextInput
  file: File
}): Promise<{ logoUrl: string; logoS3Key: string } | ServiceError> {
  if (!isOrganizationAccessible(params.organizationId, params.context)) {
    return { status: 404, error: "Organization not found" }
  }

  if (!params.context.role || !canManage(params.context.role)) {
    return { status: 403, error: "Only admins can update organization logo" }
  }

  const validation = validateUpload("logo", params.file.size, params.file.type)
  if (!validation.valid) {
    return { status: 400, error: validation.error ?? "Invalid upload" }
  }

  const organization = await findOrganizationLogoFields(params.organizationId)
  if (!organization) {
    return { status: 404, error: "Organization not found" }
  }

  if (organization.logoS3Key) {
    try {
      await deleteFile(organization.logoS3Key)
    } catch (error) {
      console.error("[Organization Logo Service] Failed to delete old logo:", error)
    }
  }

  const fileBuffer = Buffer.from(await params.file.arrayBuffer())
  const logoS3Key = S3Paths.organizationLogo(params.organizationId, params.file.name)
  const uploadResult = await uploadFile(logoS3Key, fileBuffer, params.file.type, {
    organizationId: params.organizationId,
    uploadedBy: params.actorUserId,
  })

  await updateOrganizationLogoKey(params.organizationId, logoS3Key)

  return {
    logoUrl: uploadResult.url,
    logoS3Key,
  }
}

/**
 * Resolves organization logo URL, preferring S3 storage over legacy external URL.
 */
export async function getOrganizationLogo(params: {
  organizationId: string
  context: OrganizationContextInput
}): Promise<{ logoUrl: string | null } | ServiceError> {
  if (!isOrganizationAccessible(params.organizationId, params.context)) {
    return { status: 404, error: "Organization not found" }
  }

  const organization = await findOrganizationLogoFields(params.organizationId)
  if (!organization) {
    return { status: 404, error: "Organization not found" }
  }

  if (organization.logoS3Key) {
    const logoUrl = await getPresignedDownloadUrl(organization.logoS3Key)
    return { logoUrl }
  }

  if (organization.logoUrl) {
    return { logoUrl: organization.logoUrl }
  }

  return { logoUrl: null }
}

/**
 * Deletes current organization logo from S3 and clears logo fields.
 */
export async function deleteOrganizationLogo(params: {
  organizationId: string
  context: OrganizationContextInput
}): Promise<{ success: true } | ServiceError> {
  if (!isOrganizationAccessible(params.organizationId, params.context)) {
    return { status: 404, error: "Organization not found" }
  }

  if (!params.context.role || !canManage(params.context.role)) {
    return { status: 403, error: "Only admins can remove organization logo" }
  }

  const organization = await findOrganizationLogoFields(params.organizationId)
  if (!organization) {
    return { status: 404, error: "Organization not found" }
  }

  if (organization.logoS3Key) {
    try {
      await deleteFile(organization.logoS3Key)
    } catch (error) {
      console.error("[Organization Logo Service] Failed to delete logo from S3:", error)
    }
  }

  await clearOrganizationLogo(params.organizationId)
  return { success: true }
}
