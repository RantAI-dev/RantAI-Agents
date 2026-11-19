import { authenticateV1Request } from "@/features/agent-api/service"
import { runPracticeGenerate } from "@/features/agent-api/practice/service"
import { PracticeGenerateSchema } from "@/features/agent-api/practice/types"
import { emptyRejections, isOutcomeLogged, logPracticeOutcome } from "@/features/agent-api/practice/outcome-log"

/**
 * POST /api/v1/practice/generate
 *
 * Generate a practice set from the knowledge bases of the API key's assistant:
 * one or more `topics` (or a single `topic`), up to 20 questions, of type
 * mcq_normal, mcq_multiple_correct, mcq_story (a scenario per question) or
 * mcq_mixed. Every question is verified against its book passage unless
 * `verify: false`; the `report` says how many were requested, delivered and
 * rejected, and which topics the books do not cover. The response carries the
 * answer keys, so call it from a server, not from a student's browser.
 *
 * `stream: true` (UAT issue 10) answers text/event-stream instead: progress
 * events while the set is built, then one result event with the exact JSON
 * body the non-stream path returns. Either way the request's signal is wired
 * into generation, so a client that disconnects stops the adapter calls, and
 * every request ends in one `[V1 Practice] outcome ...` log line (issue 11).
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

/** What the route knows before generation starts, for its own outcome lines. */
interface RouteHints {
  requested: number
  type: string
  stream: boolean
  verify: boolean
}

/** The outcome line for exits the practice service never sees (auth, parse, thrown). */
function routeOutcome(status: number, code: string, started: number, hints: RouteHints, aborted: boolean): void {
  logPracticeOutcome({
    status, code, requested: hints.requested, delivered: 0, adapterCalls: 0, checks: 0,
    rejected: emptyRejections(), topics: 0, skipped: 0, type: hints.type, verify: hints.verify,
    stream: hints.stream, ms: Date.now() - started, retrievalMs: 0, generateMs: 0, labelMs: 0,
    aborted,
  })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const started = Date.now()
  // Fields the body has not told us yet: an unparsed request cannot name its
  // practice type, so the line keeps a placeholder instead of dropping the key.
  const hints: RouteHints = { requested: 0, type: "-", stream: false, verify: true }
  try {
    const auth = await authenticateV1Request(req.headers.get("authorization"), req.headers)
    if ("status" in auth) {
      // Auth failures carry no error code in the body; the type stands in.
      routeOutcome(auth.status, auth.type ?? "authentication_error", started, hints, req.signal.aborted)
      return error(auth.status, auth.error, auth.type ?? "authentication_error")
    }

    const parsed = PracticeGenerateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      routeOutcome(400, "invalid_request_body", started, hints, req.signal.aborted)
      return error(400, "Invalid request body", "invalid_request_error", parsed.error.flatten())
    }
    hints.requested = parsed.data.total_questions
    hints.type = parsed.data.practice_type
    hints.stream = parsed.data.stream
    hints.verify = parsed.data.verify

    return withCors(
      await runPracticeGenerate(auth, parsed.data, { signal: req.signal, stream: parsed.data.stream }),
    )
  } catch (err) {
    console.error("[V1 Practice] Error:", err)
    // The service logs its own outcome line (with the stages it measured) and
    // marks the error; only an unmarked throw logs here, once.
    if (!isOutcomeLogged(err)) routeOutcome(500, "internal_error", started, hints, req.signal.aborted)
    return error(500, "Internal server error", "server_error")
  }
}
