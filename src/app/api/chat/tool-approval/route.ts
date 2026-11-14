import { z } from "zod"
import { auth } from "@/lib/auth"
import { forwardWithFallback } from "@/lib/rust-router/forward"
import { rustTarget } from "@/lib/rust-router/routes"
import { respondToToolApproval } from "@/lib/tools/approval"

const BodySchema = z.object({
  toolCallId: z.string().min(1).max(200),
  approved: z.boolean(),
})

// POST /api/chat/tool-approval — the user's Approve/Deny for a gated tool
// call in a live chat stream. Only the user who owns that stream can decide
// it; see src/lib/tools/approval.ts.
//
// With the `chat` group on, a stream may run in Rust (its wait is a Postgres row) or, after
// the 409 fallback, here (its wait is in this process). Rust is asked first; its 404 means
// the wait is not its own, so this process is asked next.
export async function POST(req: Request) {
  const { pathname, search } = new URL(req.url)
  const target = rustTarget(req.method, pathname, search)
  if (!target) return decideInNext(req)
  return forwardWithFallback(req, target.url, {
    fallbackOn: { status: 404, code: "not_found" },
    fallback: decideInNext,
  })
}

async function decideInNext(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  const result = respondToToolApproval({ ...parsed.data, userId: session.user.id })
  if (result === "not_found") {
    return Response.json({ error: "Approval request not found" }, { status: 404 })
  }
  return Response.json({ ok: true })
}
