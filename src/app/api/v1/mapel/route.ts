import { authenticateV1Request } from "@/features/agent-api/service"
import { listMapelForAssistant } from "@/features/agent-api/mapel"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/v1/mapel
 *
 * The subjects available to the API key's assistant, as the list a `mapel` value
 * on chat completions or practice generate may be taken from.
 *
 * The grade is fixed by the key ("Elise Kelas 8 — Latihan" only ever reads
 * grade 8), so the caller never sends it: it sends "IPA" and this endpoint
 * answers which knowledge base that resolves to, and whether it holds anything.
 * Subjects with no documents are omitted, because selecting one would produce an
 * empty answer rather than a lesson.
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

    const data = await listMapelForAssistant(assistant)

    return new Response(
      JSON.stringify({ object: "list", data }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    )
  } catch (error) {
    console.error("[V1 Mapel] Error:", error)
    return new Response(
      JSON.stringify({ error: { message: "Internal server error", type: "server_error" } }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    )
  }
}
