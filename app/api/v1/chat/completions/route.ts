import { V1ChatCompletionSchema } from "@/src/features/agent-api/schema"
import { authenticateV1Request, runV1ChatCompletion } from "@/src/features/agent-api/service"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  try {
    // Authenticate via Bearer token
    const authResult = await authenticateV1Request(req.headers.get("authorization"))
    if ("status" in authResult) {
      return new Response(
        JSON.stringify({ error: { message: authResult.error, type: "authentication_error" } }),
        { status: authResult.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      )
    }

    // Parse and validate request body
    const body = await req.json()
    const parsed = V1ChatCompletionSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Invalid request body",
            type: "invalid_request_error",
            details: parsed.error.flatten(),
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      )
    }

    return await runV1ChatCompletion(authResult, parsed.data)
  } catch (error) {
    console.error("[V1 Chat Completions] Error:", error)
    return new Response(
      JSON.stringify({ error: { message: "Internal server error", type: "server_error" } }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    )
  }
}
