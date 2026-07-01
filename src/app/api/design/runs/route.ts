import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { createDesignRun } from "@/design/server/gateway"
import type { ChatRequest } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/design/runs
//
// Daemon shape (apps/daemon/src/server.ts `/api/runs`): accepts a ChatRequest
// and returns `{ runId, conversationId?, assistantMessageId? }`
// (ChatRunCreateResponse). This is the CLI→gateway swap: instead of spawning an
// agent subprocess, we persist the user turn (Prisma) and hand the run off to
// GET /api/design/runs/:id/events, which runs OUR model gateway and streams the
// reply back in the SPA's chat SSE protocol.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  let body: ChatRequest
  try {
    body = (await req.json()) as ChatRequest
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const result = await createDesignRun(gate.ctx, body)
  if (!result.ok) return apiError(result.status, result.code, result.message)

  return NextResponse.json({
    runId: result.runId,
    conversationId: result.conversationId,
    assistantMessageId: result.assistantMessageId,
  })
}
