import { authenticateV1Request } from "@/features/agent-api/service"
import { runPracticeGrade } from "@/features/agent-api/practice/service"
import { PracticeGradeSchema } from "@/features/agent-api/practice/types"

/**
 * POST /api/v1/practice/grade
 *
 * Grade a practice set: score, per-question key and explanation, and mastery
 * per materi title. Stateless — the caller sends the set back with the answers.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
  return res
}

function error(status: number, message: string, type: string, details?: unknown): Response {
  return withCors(
    new Response(JSON.stringify({ error: { message, type, ...(details ? { details } : {}) } }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateV1Request(req.headers.get("authorization"), req.headers)
    if ("status" in auth) return error(auth.status, auth.error, "authentication_error")

    const parsed = PracticeGradeSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return error(400, "Invalid request body", "invalid_request_error", parsed.error.flatten())

    return withCors(runPracticeGrade(parsed.data))
  } catch (err) {
    console.error("[V1 Practice] Error:", err)
    return error(500, "Internal server error", "server_error")
  }
}
