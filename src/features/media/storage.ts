import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getS3Client, getBucket } from "@/lib/s3"
import type { MediaModality } from "./schema"

export interface BuildKeyInput {
  organizationId: string
  modality: MediaModality
  assetId: string
  extension: string
}

export function buildMediaS3Key(input: BuildKeyInput): string {
  const folder = input.modality.toLowerCase()
  return `media/${input.organizationId}/${folder}/${input.assetId}.${input.extension}`
}

export interface UploadMediaInput {
  organizationId: string
  modality: MediaModality
  assetId: string
  mimeType: string
  extension: string
  bytes: Uint8Array
}

export interface UploadResult {
  s3Key: string
  sizeBytes: number
}

export async function uploadMediaBytes(input: UploadMediaInput): Promise<UploadResult> {
  const s3Key = buildMediaS3Key(input)
  const client = getS3Client()

  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: s3Key,
      Body: input.bytes,
      ContentType: input.mimeType,
      CacheControl: "private, max-age=31536000",
    })
  )

  return { s3Key, sizeBytes: input.bytes.byteLength }
}

/**
 * Build a thumbnail key for video assets. Thumbnail generation itself is
 * handled by the cron poller after video assets land.
 */
export function buildThumbnailKey(input: {
  organizationId: string
  assetId: string
}): string {
  return `media/${input.organizationId}/video/${input.assetId}.thumb.jpg`
}
