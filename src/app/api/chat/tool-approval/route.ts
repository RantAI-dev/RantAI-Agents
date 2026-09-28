import { z } from "zod"
import { auth } from "@/lib/auth"
import { respondToToolApproval } from "@/lib/tools/approval"

const BodySchema = z.object({
  toolCallId: z.string().min(1).max(200),
  approved: z.boolean(),
})

// POST /api/chat/tool-approval — the user's Approve/Deny for a gated tool
// call in a live chat stream. Only the user who owns that stream can decide
// it; see src/lib/tools/approval.ts.
export async function POST(req: Request) {
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
