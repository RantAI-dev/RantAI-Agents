import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// S3 configuration from environment variables
const S3_CONFIG = {
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  bucket: process.env.S3_BUCKET || "rantai-files",
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: process.env.S3_ENABLE_PATH_STYLE === "1",
  presignedExpire: parseInt(process.env.S3_PRESIGNED_URL_EXPIRE || "7200"),
}

// Singleton S3 client instance
let s3Client: S3Client | null = null

/**
 * Get or create S3 client singleton
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    if (!S3_CONFIG.accessKeyId || !S3_CONFIG.secretAccessKey) {
      throw new Error("S3 credentials not configured. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY environment variables.")
    }

    s3Client = new S3Client({
      endpoint: S3_CONFIG.endpoint,
      region: S3_CONFIG.region,
      forcePathStyle: S3_CONFIG.forcePathStyle,
      credentials: {
        accessKeyId: S3_CONFIG.accessKeyId,
        secretAccessKey: S3_CONFIG.secretAccessKey,
      },
    })
  }
  return s3Client
}

/**
 * Get the configured bucket name
 */
export function getBucket(): string {
  return S3_CONFIG.bucket
}

/**
 * Path generators for consistent S3 key structure
 */
export const S3Paths = {
  /**
   * Path for knowledge documents
   * Format: documents/{orgId|global}/{docId}/{filename}
   */
  document: (orgId: string | null, docId: string, filename: string): string =>
    `documents/${orgId || "global"}/${docId}/${sanitizeFilename(filename)}`,

  /**
   * Path for organization logos
   * Format: organizations/{orgId}/logo/{filename}
   */
  organizationLogo: (orgId: string, filename: string): string =>
    `organizations/${orgId}/logo/${sanitizeFilename(filename)}`,

  /**
   * Path for user avatars
   * Format: users/{userId}/avatar/{filename}
   */
  userAvatar: (userId: string, filename: string): string =>
    `users/${userId}/avatar/${sanitizeFilename(filename)}`,

  /**
   * Path for chat message attachments
   * Format: chat/{sessionId}/{messageId}/{filename}
   */
  chatAttachment: (sessionId: string, messageId: string, filename: string): string =>
    `chat/${sessionId}/${messageId}/${sanitizeFilename(filename)}`,

  /**
   * Path for temporary uploads
   * Format: temp/{uploadId}/{filename}
   */
  temp: (uploadId: string, filename: string): string =>
    `temp/${uploadId}/${sanitizeFilename(filename)}`,
}

/**
 * Sanitize filename for safe S3 key usage
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 255)
}

/**
 * Upload a file buffer to S3
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ key: string; url: string; size: number }> {
  const client = getS3Client()

  await client.send(
    new PutObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
    })
  )

  const url = await getPresignedDownloadUrl(key)

  return {
    key,
    url,
    size: buffer.length,
  }
}

/**
 * Upload a file from a stream/blob
 */
export async function uploadStream(
  key: string,
  body: ReadableStream | Blob | Uint8Array,
  contentType: string,
  contentLength?: number,
  metadata?: Record<string, string>
): Promise<{ key: string; url: string }> {
  const client = getS3Client()

  await client.send(
    new PutObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
      Metadata: metadata,
    })
  )

  const url = await getPresignedDownloadUrl(key)

  return { key, url }
}

/**
 * Generate a presigned URL for downloading a file
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn?: number
): Promise<string> {
  const client = getS3Client()

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: key,
    }),
    { expiresIn: expiresIn || S3_CONFIG.presignedExpire }
  )
}

/**
 * Generate a presigned URL for direct client-side upload
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const client = getS3Client()

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  )
}

/**
 * Download a file from S3
 */
export async function downloadFile(key: string): Promise<Buffer> {
  const client = getS3Client()

  const response = await client.send(
    new GetObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: key,
    })
  )

  if (!response.Body) {
    throw new Error(`No body in S3 response for key: ${key}`)
  }

  const byteArray = await response.Body.transformToByteArray()
  return Buffer.from(byteArray)
}

/**
 * Delete a single file from S3
 */
export async function deleteFile(key: string): Promise<void> {
  const client = getS3Client()

  await client.send(
    new DeleteObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: key,
    })
  )
}

/**
 * Delete multiple files from S3
 */
export async function deleteFiles(keys: string[]): Promise<void> {
  if (keys.length === 0) return

  const client = getS3Client()

  // S3 allows max 1000 objects per delete request
  const chunks = []
  for (let i = 0; i < keys.length; i += 1000) {
    chunks.push(keys.slice(i, i + 1000))
  }

  for (const chunk of chunks) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: S3_CONFIG.bucket,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
        },
      })
    )
  }
}

/**
 * Check if a file exists in S3
 */
export async function fileExists(key: string): Promise<boolean> {
  const client = getS3Client()

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: key,
      })
    )
    return true
  } catch {
    return false
  }
}

/**
 * Get file metadata without downloading the file
 */
export async function getFileMetadata(key: string): Promise<{
  contentType?: string
  contentLength?: number
  lastModified?: Date
  metadata?: Record<string, string>
} | null> {
  const client = getS3Client()

  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: key,
      })
    )

    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    }
  } catch {
    return null
  }
}

/**
 * Ensure the bucket exists, create if not
 */
export async function ensureBucket(): Promise<void> {
  const client = getS3Client()

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: S3_CONFIG.bucket,
      })
    )
  } catch (error: unknown) {
    // Bucket doesn't exist, create it
    if (error && typeof error === "object" && "name" in error && error.name === "NotFound") {
      await client.send(
        new CreateBucketCommand({
          Bucket: S3_CONFIG.bucket,
        })
      )
      console.log(`[S3] Created bucket: ${S3_CONFIG.bucket}`)
    } else {
      throw error
    }
  }
}

/**
 * Get a public/presigned URL for a file
 * Always uses presigned URLs for security
 */
export async function getFileUrl(key: string, expiresIn?: number): Promise<string> {
  return getPresignedDownloadUrl(key, expiresIn)
}

/**
 * Upload limits by file type
 */
export const UPLOAD_LIMITS = {
  document: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/heic",
      "text/markdown",
      "text/plain",
    ],
  },
  logo: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"],
  },
  avatar: {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  attachment: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/pdf",
      "text/plain",
      "text/markdown",
    ],
  },
} as const

export type UploadType = keyof typeof UPLOAD_LIMITS

/**
 * Validate file upload against limits
 */
export function validateUpload(
  type: UploadType,
  size: number,
  mimeType: string
): { valid: boolean; error?: string } {
  const limits = UPLOAD_LIMITS[type]

  if (size > limits.maxSize) {
    const maxMB = Math.round(limits.maxSize / (1024 * 1024))
    return { valid: false, error: `File size exceeds ${maxMB}MB limit` }
  }

  if (!limits.allowedTypes.includes(mimeType)) {
    return { valid: false, error: `File type ${mimeType} is not allowed` }
  }

  return { valid: true }
}
