import { NextResponse } from "next/server"

import { uploadMediaBytes } from "@/features/media/storage"
import { getMobileContext } from "@/lib/mobile-org"
import { prisma } from "@/lib/prisma"

export const maxDuration = 60

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])

/**
 * POST /api/mobile/media/uploads — multipart `file` (image). Stores it and
 * creates a synthetic upload job + asset so it can be passed as a reference
 * image in a later generation. Returns `{ assetId }`.
 */
export async function POST(req: Request) {
  const ctx = await getMobileContext(req)
  if (!ctx || !ctx.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid multipart form" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `file` field" }, { status: 400 })
  }
  const mime = file.type.split(";")[0].trim().toLowerCase()
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 }
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const extension = mime.split("/")[1] ?? "png"

  const job = await prisma.mediaJob.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      modality: "IMAGE",
      modelId: "user/upload",
      prompt: `(uploaded) ${file.name}`,
      parameters: {},
      referenceAssetIds: [],
      status: "SUCCEEDED",
      estimatedCostCents: 0,
      costCents: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  })

  const upload = await uploadMediaBytes({
    organizationId: ctx.organizationId,
    modality: "IMAGE",
    assetId: job.id,
    mimeType: mime,
    extension,
    bytes,
  })

  const asset = await prisma.mediaAsset.create({
    data: {
      jobId: job.id,
      organizationId: ctx.organizationId,
      modality: "IMAGE",
      mimeType: mime,
      s3Key: upload.s3Key,
      sizeBytes: upload.sizeBytes,
      metadata: { uploadedFilename: file.name },
    },
  })

  return NextResponse.json({ assetId: asset.id, mimeType: asset.mimeType, size: asset.sizeBytes })
}
