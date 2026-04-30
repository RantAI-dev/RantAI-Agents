import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getDashboardChatSessionArtifact,
  updateDashboardChatSessionArtifact,
} from "@/features/conversations/sessions/service"
import { llmRewriteWithRetry } from "@/lib/document-script/llm-rewrite"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { DashboardChatSessionArtifactParamsSchema } from "@/features/conversations/sessions/schema"

export const runtime = "nodejs"

// Simple in-process token bucket — 10 edits / 60s / user. Good enough to
// stop a runaway frontend retry loop or a single user blasting the LLM;
// not a substitute for a real distributed rate limiter.
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000
const buckets = new Map<string, { count: number; resetAt: number }>()

function checkRate(userId: string): boolean {
  const now = Date.now()
  const b = buckets.get(userId)
  if (!b || now >= b.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (b.count >= RATE_LIMIT) return false
  b.count++
  return true
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!checkRate(session.user.id)) {
    return NextResponse.json({ error: "rate limit: 10 edits/min" }, { status: 429 })
  }

  // D-71: validate route params via Zod the same way `route.ts` (PUT/DELETE)
  // and `download/route.ts` do — empty/malformed ids previously fell through
  // to the DB and surfaced a 404 instead of a clean 400.
  const rawParams = await params
  const paramParse = DashboardChatSessionArtifactParamsSchema.safeParse(rawParams)
  if (!paramParse.success) {
    return NextResponse.json(
      { error: "invalid params", issues: paramParse.error.issues },
      { status: 400 },
    )
  }
  const { id, artifactId } = paramParse.data

  let body: { editPrompt?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 })
  }
  if (!body.editPrompt || typeof body.editPrompt !== "string") {
    return NextResponse.json({ error: "editPrompt required" }, { status: 400 })
  }

  const artifact = await getDashboardChatSessionArtifact({
    userId: session.user.id,
    sessionId: id,
    artifactId,
  })
  if (isHttpServiceError(artifact)) {
    return NextResponse.json({ error: artifact.error }, { status: artifact.status })
  }
  if (artifact.artifactType !== "text/document") {
    return NextResponse.json(
      { error: "edit only supported for text/document artifacts" },
      { status: 400 },
    )
  }

  const r = await llmRewriteWithRetry({
    currentScript: artifact.content,
    editPrompt: body.editPrompt,
  })
  if (!r.ok || !r.script) {
    return NextResponse.json({ error: r.error ?? "rewrite failed" }, { status: 422 })
  }

  const updated = await updateDashboardChatSessionArtifact({
    userId: session.user.id,
    sessionId: id,
    artifactId,
    input: {
      content: r.script,
      title: artifact.title,
    },
  })
  if (isHttpServiceError(updated)) {
    return NextResponse.json({ error: updated.error }, { status: updated.status })
  }
  return NextResponse.json({ id: updated.id, content: updated.content, attempts: r.attempts })
}
