import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { startDesignSystemGenerationJob } from "@/design/server/design-system-generation"
import type { UserDesignSystemInput } from "@/design/server/user-design-systems"

// POST /api/design/design-systems/generation-jobs
//
// Daemon shape (apps/daemon/src/routes/design-systems.ts): `202 { job }`.
// Composes a design-system-generation prompt from the user's brief and runs it
// through OUR model gateway (design-system-generation.ts) to produce a real
// DESIGN.md, persisting the result as a user OdDesignSystem. Returns the queued
// job immediately; the SPA polls the sibling GET until it succeeds, then reads
// the created system via job.designSystemId.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  let input: UserDesignSystemInput
  try {
    input = ((await req.json()) as UserDesignSystemInput) || {}
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid request body")
  }
  const job = startDesignSystemGenerationJob(gate.ctx, input)
  return NextResponse.json({ job }, { status: 202 })
}
