import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { downloadFile } from "@/lib/s3"
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
 * GET /api/widget/asset?key=rantai_live_...&documentId=...&assetKey=...
 *
 * Public, embed-key-authed streaming of a cropped figure/asset (multimodal
 * RAG) so external frontends can render figures via a plain <img src>. The key
 * is accepted as a query param (needed for <img>) or the X-Widget-Api-Key
 * header. Guards: the key must be enabled, the document must belong to one of
 * the key's assistant's KB groups, and the asset key must live under that
 * document's asset prefix (IDOR).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const key = url.searchParams.get("key") || request.headers.get("X-Widget-Api-Key")
  const documentId = url.searchParams.get("documentId")
  const assetKey = url.searchParams.get("assetKey")

  if (!key || !documentId || !assetKey) {
    return NextResponse.json({ error: "key, documentId and assetKey are required" }, { status: 400, headers: CORS })
  }

  try {
    const embedKey = await findEnabledWidgetEmbedKey(key)
    if (!embedKey) {
      return NextResponse.json({ error: "API key not found or disabled" }, { status: 401, headers: CORS })
    }

    const assistant = await findWidgetAssistantById(embedKey.assistantId)
    if (!assistant || !assistant.useKnowledgeBase || assistant.knowledgeBaseGroupIds.length === 0) {
      return NextResponse.json({ error: "No knowledge base for this key" }, { status: 403, headers: CORS })
    }

    // Access guard: the document must be in one of the assistant's KB groups.
    const inScope = await prisma.documentGroup.findFirst({
      where: { documentId, groupId: { in: assistant.knowledgeBaseGroupIds } },
      select: { id: true },
    })
    if (!inScope) {
      return NextResponse.json({ error: "Document not accessible for this key" }, { status: 403, headers: CORS })
    }

    // IDOR guard: the asset must live under THIS document's asset folder. We
    // match on the document segment rather than the org segment — the stored
    // org path can differ from the key's org (e.g. content migrated between
    // orgs), but the documentId (already checked to be in the key's KB above)
    // uniquely scopes the asset.
    if (!assetKey.startsWith("documents/") || !assetKey.includes(`/${documentId}/assets/`)) {
      return NextResponse.json({ error: "Asset not in this document" }, { status: 403, headers: CORS })
    }

    const buffer = await downloadFile(assetKey)
    return new Response(new Uint8Array(buffer), {
      headers: {
        ...CORS,
        "Content-Type": "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    })
  } catch (error) {
    console.error("[Widget Asset] failed:", error)
    return NextResponse.json({ error: "Failed to load asset" }, { status: 500, headers: CORS })
  }
}
