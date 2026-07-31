import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { findEnabledWidgetEmbedKey, findWidgetAssistantById } from "@/features/widget/chat/repository"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Widget-Api-Key",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * GET /api/widget/kbs?key=rantai_live_...   (or X-Widget-Api-Key header)
 *
 * Lists the knowledge bases (KB groups) the key's assistant is bound to, so an
 * external frontend can render a KB picker. The returned `id`s are exactly the
 * values accepted in POST /api/widget/chat `knowledgeBaseGroupIds`.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") || request.headers.get("X-Widget-Api-Key")
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400, headers: CORS })
  }

  try {
    const embedKey = await findEnabledWidgetEmbedKey(key)
    if (!embedKey) {
      return NextResponse.json({ error: "API key not found or disabled" }, { status: 401, headers: CORS })
    }

    const assistant = await findWidgetAssistantById(embedKey.assistantId)
    const groupIds = assistant?.knowledgeBaseGroupIds ?? []
    if (!assistant?.useKnowledgeBase || groupIds.length === 0) {
      return NextResponse.json({ kbs: [] }, { headers: CORS })
    }

    const groups = await prisma.knowledgeBaseGroup.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, name: true, description: true, color: true },
    })
    const counts = await prisma.documentGroup.groupBy({
      by: ["groupId"],
      where: { groupId: { in: groupIds } },
      _count: { groupId: true },
    })
    const countByGroup = new Map(counts.map((c) => [c.groupId, c._count.groupId]))

    const kbs = groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      documentCount: countByGroup.get(g.id) ?? 0,
    }))

    return NextResponse.json({ kbs }, { headers: CORS })
  } catch (error) {
    console.error("[Widget KBs] failed:", error)
    return NextResponse.json({ error: "Failed to list knowledge bases" }, { status: 500, headers: CORS })
  }
}
