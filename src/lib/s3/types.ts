/**
 * S3 file metadata stored in database
 */
export interface S3FileMetadata {
  key: string
  originalFilename: string
  contentType: string
  size: number
  uploadedAt: string
  uploadedBy?: string
}

/**
 * File attachment data structure
 */
export interface FileAttachment {
  id: string
  s3Key: string
  filename: string
  contentType: string
  size: number
  url?: string // Presigned URL (ephemeral, generated on demand)
}

/**
 * Upload request body
 */
export interface UploadRequest {
  type: "document" | "logo" | "avatar" | "attachment"
  targetId?: string // documentId, orgId, userId, or messageId
  filename?: string
}

/**
 * Upload response
 */
export interface UploadResponse {
  key: string
  url: string
  filename: string
  contentType: string
  size: number
}

/**
 * Presigned upload URL response
 */
export interface PresignedUploadResponse {
  uploadUrl: string
  key: string
  expiresAt: string
}

/**
 * File download/access response
 */
export interface FileAccessResponse {
  url: string
  filename: string
  contentType: string
  size?: number
  expiresAt: string
}
