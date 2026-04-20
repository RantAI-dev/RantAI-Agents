import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  getCachedMermaid,
  putCachedMermaid,
  MERMAID_CACHE_MAX_BYTES,
} from "@/lib/rendering/mermaid-cache"

export const runtime = "nodejs"

/**
 * GET /api/rendering/mermaid?hash=<sha256>
 *
 * Cache lookup. Returns 200 with `{ pngDataUrl, width, height }` on hit,
 * 404 on miss. `organizationId` is resolved from the authenticated
 * session — the client does not (and cannot) supply it.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const orgContext = await getOrganizationContextWithFallback(
    req,
    session.user.id,
  )
  const organizationId = orgContext?.organizationId ?? null

  const { searchParams } = new URL(req.url)
  const hash = searchParams.get("hash")
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    return NextResponse.json(
      { error: "Missing or malformed hash" },
      { status: 400 },
    )
  }

  const cached = await getCachedMermaid({ hash, organizationId })
  if (!cached) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const pngDataUrl = `data:image/png;base64,${cached.png.toString("base64")}`
  return NextResponse.json({
    pngDataUrl,
    width: cached.width,
    height: cached.height,
  })
}

/**
 * POST /api/rendering/mermaid
 *
 * Fire-and-forget cache write. Body:
 *   { hash, pngDataUrl, width, height, mermaidVersion }
 *
 * The client is expected to have already checked the cap client-side,
 * but we re-check server-side as defense-in-depth (a malicious client
 * could otherwise pad arbitrary bytes into our DB).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const orgContext = await getOrganizationContextWithFallback(
    req,
    session.user.id,
  )
  const organizationId = orgContext?.organizationId ?? null

  const body = (await req.json().catch(() => null)) as {
    hash?: unknown
    pngDataUrl?: unknown
    width?: unknown
    height?: unknown
    mermaidVersion?: unknown
  } | null

  if (
    !body ||
    typeof body.hash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(body.hash) ||
    typeof body.pngDataUrl !== "string" ||
    typeof body.width !== "number" ||
    typeof body.height !== "number" ||
    typeof body.mermaidVersion !== "string"
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const match = body.pngDataUrl.match(/^data:image\/png;base64,(.+)$/)
  if (!match) {
    return NextResponse.json(
      { error: "Not a PNG data URL" },
      { status: 400 },
    )
  }
  const png = Buffer.from(match[1], "base64")
  if (png.byteLength > MERMAID_CACHE_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `PNG size ${png.byteLength} exceeds cap ${MERMAID_CACHE_MAX_BYTES}`,
      },
      { status: 413 },
    )
  }

  await putCachedMermaid({
    hash: body.hash,
    organizationId,
    png,
    width: body.width,
    height: body.height,
    mermaidVersion: body.mermaidVersion,
  })

  return NextResponse.json({ ok: true })
}
