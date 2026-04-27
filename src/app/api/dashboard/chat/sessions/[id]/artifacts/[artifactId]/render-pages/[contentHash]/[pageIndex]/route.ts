import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCachedPngs } from "@/lib/document-script/cache"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string; contentHash: string; pageIndex: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { artifactId, contentHash, pageIndex } = await params
  const idx = parseInt(pageIndex, 10)
  if (Number.isNaN(idx) || idx < 0) return NextResponse.json({ error: "bad pageIndex" }, { status: 400 })

  const pages = await getCachedPngs(artifactId, contentHash)
  if (!pages || idx >= pages.length) {
    return NextResponse.json({ error: "page not found" }, { status: 404 })
  }
  return new Response(new Uint8Array(pages[idx]), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  })
}
