import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"
import { renderArtifactPreview } from "@/lib/rendering/server/docx-preview-pipeline"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, artifactId } = await params
  const result = await getDashboardChatSessionArtifact({
    userId: session.user.id, sessionId: id, artifactId,
  })
  if (isHttpServiceError(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.artifactType !== "text/document") {
    return NextResponse.json({ error: "preview not applicable" }, { status: 400 })
  }
  try {
    const r = await renderArtifactPreview(artifactId, result.content)
    return NextResponse.json({ hash: r.hash, pageCount: r.pages.length, cached: r.cached })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
