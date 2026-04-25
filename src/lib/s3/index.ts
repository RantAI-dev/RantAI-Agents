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
import { getArtifactRegistryEntry } from "@/features/conversations/components/chat/artifacts/registry"

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
   * Path for agent/assistant avatars
   * Format: agents/{orgId|global}/{assistantId}/avatar/{filename}
   */
  agentAvatar: (orgId: string | null, assistantId: string, filename: string): string =>
    `agents/${orgId || "global"}/${assistantId}/avatar/${sanitizeFilename(filename)}`,

  /**
   * Path for temporary uploads
   * Format: temp/{uploadId}/{filename}
   */
  temp: (uploadId: string, filename: string): string =>
    `temp/${uploadId}/${sanitizeFilename(filename)}`,

  /**
   * Path for chat artifacts (stored as knowledge documents)
   * Format: artifacts/{orgId|global}/{sessionId}/{artifactId}{ext}
   */
  artifact: (orgId: string | null, sessionId: string, artifactId: string, ext: string): string =>
    `artifacts/${orgId || "global"}/${sessionId}/${artifactId}${ext}`,
}

/**
 * Get file extension for an artifact type. Derived from the central artifact
 * registry — to add a new type, edit
 * `src/features/conversations/components/chat/artifacts/registry.ts`.
 */
export function getArtifactExtension(type: string): string {
  return getArtifactRegistryEntry(type)?.extension ?? ".txt"
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
  expiresIn?: number,
  options?: { downloadFilename?: string }
): Promise<string> {
  const client = getS3Client()

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: key,
      // When a filename is provided, instruct S3 to force an attachment
      // download with that filename instead of letting the browser render
      // the response inline.
      ...(options?.downloadFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${options.downloadFilename.replace(/"/g, "")}"`,
          }
        : {}),
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
    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: S3_CONFIG.bucket,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
        },
      })
    )
    // S3 reports per-object failures in `response.Errors[]` even when
    // the overall command "succeeds". Without inspecting them, a key
    // that failed to delete (auth, missing, server error) would never
    // be retried and would leak indefinitely. Log so the orphans show
    // up in monitoring; don't throw because partial delete is the
    // typical contract for callers.
    if (response.Errors && response.Errors.length > 0) {
      for (const err of response.Errors) {
        console.error(
          `[s3.deleteFiles] partial failure key=${err.Key} code=${err.Code} message=${err.Message}`,
        )
      }
    }
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
      // Existing
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/heic",
      "text/markdown",
      "text/plain",
      // Office (Tier 1)
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      // Structured data (Tier 1)
      "text/csv",
      "text/tab-separated-values",
      "application/json",
      "application/x-ndjson",
      "text/html",
      "application/xml",
      "text/xml",
      // Rich text & ebooks (Tier 2)
      "application/rtf",
      "application/epub+zip",
      // Config / code (Tier 2)
      "text/yaml",
      "application/toml",
      "text/x-python",
      "text/javascript",
      "text/typescript",
      // Legacy Office (Tier 3)
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      // OpenDocument (Tier 3)
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      // 3D models (Tier 3)
      "model/gltf+json",
      "model/gltf-binary",
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
      // Existing (no HEIC — browsers can't produce it)
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/pdf",
      "text/plain",
      "text/markdown",
      // Office (Tier 1)
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      // Structured data (Tier 1)
      "text/csv",
      "text/tab-separated-values",
      "application/json",
      "application/x-ndjson",
      "text/html",
      "application/xml",
      "text/xml",
      // Rich text & ebooks (Tier 2)
      "application/rtf",
      "application/epub+zip",
      // Config / code (Tier 2)
      "text/yaml",
      "application/toml",
      "text/x-python",
      "text/javascript",
      "text/typescript",
      // Legacy Office (Tier 3)
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      // OpenDocument (Tier 3)
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      // 3D models (Tier 3)
      "model/gltf+json",
      "model/gltf-binary",
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
