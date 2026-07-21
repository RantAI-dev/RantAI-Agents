import { NextResponse } from "next/server"

import { CreateMediaJobInputSchema, ListJobsQuerySchema } from "@/features/media/schema"
import { createMediaJob } from "@/features/media/service"
import { listJobsForUser } from "@/features/media/repository"
import { createMobileAudioJob } from "@/lib/mobile-media-audio"
import { getMobileContext } from "@/lib/mobile-org"

// Image/audio generation is synchronous; give the route headroom beyond 60s.
export const maxDuration = 300

/**
 * POST /api/mobile/media/jobs — generate media (image/audio). Synchronous: the
 * response contains the finished job with its assets. Video is not supported on
 * mobile yet (the web path blocks for minutes).
 */
export async function POST(req: Request) {
  const ctx = await getMobileContext(req)
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ctx.organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = CreateMediaJobInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  if (parsed.data.modality === "VIDEO") {
    return NextResponse.json(
      { error: "Video generation is not supported on mobile yet." },
      { status: 400 }
    )
  }

  try {
    // Audio uses a mobile-only non-streaming path (playable WAV) so the shared
    // web generateAudio is left untouched. Image stays on the shared service.
    const result =
      parsed.data.modality === "AUDIO"
        ? await createMobileAudioJob({
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            modelId: parsed.data.modelId,
            prompt: parsed.data.prompt,
            parameters: parsed.data.parameters,
            referenceAssetIds: parsed.data.referenceAssetIds,
          })
        : await createMediaJob({
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            ...parsed.data,
          })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Media API] POST /jobs failed:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** GET /api/mobile/media/jobs — the current user's generation history. */
export async function GET(req: Request) {
  const ctx = await getMobileContext(req)
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = ListJobsQuerySchema.safeParse({
    modality: url.searchParams.get("modality") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 })
  }

  const result = await listJobsForUser({ userId: ctx.userId, ...parsed.data })
  return NextResponse.json(result)
}
