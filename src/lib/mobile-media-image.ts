/**
 * Mobile-only image post-processing.
 *
 * The image models available via OpenRouter ignore width/height and always emit
 * a square image. To honor the aspect ratio the user picked on mobile, we
 * center-crop the generated image to that ratio and overwrite the stored asset.
 * This is mobile-only and does not touch the shared web generation path.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3"
import sharp from "sharp"

import { downloadMediaBytes } from "@/features/media/storage"
import { getBucket, getS3Client } from "@/lib/s3"
import { prisma } from "@/lib/prisma"

interface JobWithAssets {
  id: string
  assets: Array<{ id: string; s3Key: string; modality: string; mimeType: string }>
}

/**
 * Center-crop every image asset of a finished job to the target aspect ratio
 * (given as target width/height), then persist the new bytes + dimensions.
 * A 1:1 target (or a crop that would be a no-op) is skipped. Returns the job
 * re-loaded with the updated assets.
 */
export async function applyAspectRatioToImageJob(
  job: JobWithAssets,
  targetW: number,
  targetH: number,
): Promise<unknown> {
  const ratio = targetW / targetH
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 0.01) {
    return job // 1:1 (or invalid) — nothing to adjust.
  }

  let changed = false
  for (const asset of job.assets) {
    if (asset.modality !== "IMAGE") continue
    try {
      const { bytes } = await downloadMediaBytes(asset.s3Key)
      const meta = await sharp(bytes).metadata()
      const sw = meta.width ?? 0
      const sh = meta.height ?? 0
      if (!sw || !sh) continue

      const srcRatio = sw / sh
      let cw: number
      let ch: number
      if (srcRatio > ratio) {
        ch = sh
        cw = Math.round(sh * ratio)
      } else {
        cw = sw
        ch = Math.round(sw / ratio)
      }
      if (cw >= sw && ch >= sh) continue // already the right shape

      const left = Math.round((sw - cw) / 2)
      const top = Math.round((sh - ch) / 2)
      const out = await sharp(bytes)
        .extract({ left, top, width: cw, height: ch })
        .png()
        .toBuffer()

      await getS3Client().send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: asset.s3Key,
          Body: out,
          ContentType: asset.mimeType,
          CacheControl: "private",
        }),
      )
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { width: cw, height: ch, sizeBytes: out.length },
      })
      changed = true
    } catch (error) {
      console.error(`[Mobile Media] aspect-ratio crop failed for ${asset.id}:`, error)
    }
  }

  if (!changed) return job
  return prisma.mediaJob.findUniqueOrThrow({ where: { id: job.id }, include: { assets: true } })
}
