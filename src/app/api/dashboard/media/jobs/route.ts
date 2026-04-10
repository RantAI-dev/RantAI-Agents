import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { CreateMediaJobInputSchema, ListJobsQuerySchema } from "@/features/media/schema"
import {
  createMediaJob,
  MediaLimitExceededError,
} from "@/features/media/service"
import { listJobsForUser } from "@/features/media/repository"

// Video generation can take several minutes. Give the route plenty of
// headroom beyond the default 60s for serverless environments.
export const maxDuration = 800

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
  if (!orgContext) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 })
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

  try {
    const result = await createMediaJob({
      userId: session.user.id,
      organizationId: orgContext.organizationId,
      ...parsed.data,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof MediaLimitExceededError) {
      return NextResponse.json(
        {
          error: "Media generation limit exceeded",
          limit: error.limitCents,
          used: error.usedCents,
          requested: error.requestedCents,
        },
        { status: 402 }
      )
    }
    // Log the full error server-side so it shows up in the dev console
    // regardless of how the client surfaces it.
    console.error("[media] POST /jobs failed:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
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

  const result = await listJobsForUser({
    userId: session.user.id,
    ...parsed.data,
  })
  return NextResponse.json(result)
}
