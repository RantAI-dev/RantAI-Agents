import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { prisma } from "@/lib/prisma"
import { uploadMediaBytes } from "@/features/media/storage"

export const maxDuration = 60

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

/**
 * POST /api/dashboard/media/uploads
 *
 * Accepts a multipart form with a single `file` field. Stores the image in
 * object storage and creates a synthetic "upload" MediaJob + MediaAsset pair
 * so the asset can be used as a reference in subsequent generation jobs.
 * Returns `{ assetId }`.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgContext = await getOrganizationContextWithFallback(
    req,
    session.user.id
  )
  if (!orgContext) {
    return NextResponse.json(
      { error: "No organization context" },
      { status: 401 }
    )
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
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    )
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 }
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const extension = file.type.split("/")[1] ?? "png"

  // Create a synthetic SUCCEEDED job row to satisfy the required MediaAsset.jobId FK.
  const job = await prisma.mediaJob.create({
    data: {
      organizationId: orgContext.organizationId,
      userId: session.user.id,
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
    organizationId: orgContext.organizationId,
    modality: "IMAGE",
    assetId: job.id,
    mimeType: file.type,
    extension,
    bytes,
  })

  const asset = await prisma.mediaAsset.create({
    data: {
      jobId: job.id,
      organizationId: orgContext.organizationId,
      modality: "IMAGE",
      mimeType: file.type,
      s3Key: upload.s3Key,
      sizeBytes: upload.sizeBytes,
      metadata: { uploadedFilename: file.name },
    },
  })

  return NextResponse.json({
    assetId: asset.id,
    mimeType: asset.mimeType,
    size: asset.sizeBytes,
  })
}
