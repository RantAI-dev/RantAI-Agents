import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { downloadFile } from "@/lib/s3"
import { getDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface VersionRecord {
  s3Key?: string
  content?: string
  archiveFailed?: boolean
  title?: string
  timestamp?: number
  contentLength?: number
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; artifactId: string; versionNum: string }> },
) {
  try {
    const { id: sessionId, artifactId, versionNum: versionNumRaw } = await ctx.params

    const versionNum = Number.parseInt(versionNumRaw, 10)
    if (!Number.isInteger(versionNum) || versionNum < 1) {
      return NextResponse.json({ error: "invalid versionNum" }, { status: 400 })
    }

    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await getDashboardChatSessionArtifact({
      userId: session.user.id,
      sessionId,
      artifactId,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const metadata = result.metadata as { versions?: VersionRecord[] } | null
    const versions = metadata?.versions ?? []
    const record = versions[versionNum - 1]
    if (!record) {
      return NextResponse.json({ error: "version not found" }, { status: 404 })
    }
    if (record.archiveFailed) {
      return NextResponse.json({ error: "archived" }, { status: 410 })
    }

    const headers = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
    })

    if (typeof record.content === "string") {
      return new Response(record.content, { status: 200, headers })
    }
    if (record.s3Key) {
      try {
        const buf = await downloadFile(record.s3Key)
        return new Response(buf, { status: 200, headers })
      } catch (err) {
        console.error("[versions/GET] S3 download failed:", err)
        return NextResponse.json({ error: "fetch failed" }, { status: 502 })
      }
    }

    return NextResponse.json({ error: "version has no content" }, { status: 404 })
  } catch (error) {
    console.error("[versions/GET] unhandled error:", error)
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}
