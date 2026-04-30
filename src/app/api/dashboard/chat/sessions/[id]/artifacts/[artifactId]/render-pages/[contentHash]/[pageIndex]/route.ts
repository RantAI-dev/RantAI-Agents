import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCachedPngs } from "@/lib/document-script/cache"
import { getDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string; contentHash: string; pageIndex: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, artifactId, contentHash, pageIndex } = await params
  const idx = parseInt(pageIndex, 10)
  if (Number.isNaN(idx) || idx < 0) return NextResponse.json({ error: "bad pageIndex" }, { status: 400 })

  // D-72: enforce session ownership before serving cached PNG bytes — every
  // sibling artifact route gates on this; render-pages was the only IDOR
  // surface (contentHash alone was the de-facto authz token).
  const owned = await getDashboardChatSessionArtifact({
    userId: session.user.id,
    sessionId: id,
    artifactId,
  })
  if (isHttpServiceError(owned)) {
    return NextResponse.json({ error: owned.error }, { status: owned.status })
  }
  if (owned.artifactType !== "text/document") {
    return NextResponse.json({ error: "preview not applicable" }, { status: 400 })
  }

  const pages = await getCachedPngs(artifactId, contentHash)
  if (!pages || idx >= pages.length) {
    return NextResponse.json({ error: "page not found" }, { status: 404 })
  }
  return new Response(new Uint8Array(pages[idx]), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  })
}
