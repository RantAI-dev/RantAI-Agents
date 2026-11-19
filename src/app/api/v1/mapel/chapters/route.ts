import { authenticateV1Request } from "@/features/agent-api/service"
import { chaptersForAssistantMapel } from "@/features/agent-api/chapters"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/v1/mapel/chapters?mapel=<name>
 *
 * The chapters ("Bab / Topik") of one subject's books, for a client's topic
 * picker. Auth is exactly GET /api/v1/mapel: the Bearer API key fixes the
 * assistant, the assistant fixes the grade, and the subject must be one of
 * that assistant's — an unknown subject is the same 400 a chat request with
 * that `mapel` gets. The subject name comes as a QUERY PARAMETER (no
 * `[id]` path segment) because that is what a picker that already holds
 * the name from GET /api/v1/mapel has to send.
 *
 * Thin route: the resolution, tenancy and chapter sources live in
 * src/features/agent-api/chapters.ts.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateV1Request(req.headers.get("authorization"), req.headers)
    if ("status" in auth) {
      return new Response(
        JSON.stringify({ error: { message: auth.error, type: auth.type ?? "authentication_error" } }),
        { status: auth.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      )
    }

    const assistant = await prisma.assistant.findUnique({
      where: { id: auth.apiKey.assistantId },
      select: { organizationId: true, knowledgeBaseGroupIds: true },
    })
    if (!assistant) {
      return new Response(
        JSON.stringify({ error: { message: "Assistant not found", type: "server_error" } }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      )
    }

    const mapel = new URL(req.url).searchParams.get("mapel")?.trim()
    if (!mapel) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Missing required query parameter: mapel. Call GET /api/v1/mapel for the list.",
            type: "invalid_request_error",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      )
    }

    const result = await chaptersForAssistantMapel(assistant, mapel)
    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: { message: result.message, type: result.type } }),
        { status: result.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      )
    }

    return new Response(
      JSON.stringify(result.body),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    )
  } catch (error) {
    console.error("[V1 Mapel Chapters] Error:", error)
    return new Response(
      JSON.stringify({ error: { message: "Internal server error", type: "server_error" } }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    )
  }
}
