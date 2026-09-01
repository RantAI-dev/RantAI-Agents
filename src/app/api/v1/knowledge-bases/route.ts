import { authenticateV1Request } from "@/features/agent-api/service"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/v1/knowledge-bases
 *
 * The companion to `knowledge_base_ids` on chat completions: a client cannot
 * choose a knowledge base whose id it has no way to learn. Returns the bases
 * owned by the API key's organisation, with document counts so a caller can
 * tell a populated subject from an empty placeholder, and a flag marking the
 * ones this key's assistant reads by default.
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
        JSON.stringify({ error: { message: auth.error, type: "authentication_error" } }),
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

    const defaults = new Set(assistant.knowledgeBaseGroupIds)
    const groups = await prisma.knowledgeBaseGroup.findMany({
      where: { organizationId: assistant.organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { documents: true } },
      },
      orderBy: { name: "asc" },
    })

    return new Response(
      JSON.stringify({
        object: "list",
        data: groups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          document_count: g._count.documents,
          // Empty bases are returned rather than hidden: a caller asking why an
          // answer was thin is better served by seeing the base holds nothing.
          is_default: defaults.has(g.id),
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    )
  } catch (error) {
    console.error("[V1 Knowledge Bases] Error:", error)
    return new Response(
      JSON.stringify({ error: { message: "Internal server error", type: "server_error" } }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    )
  }
}
