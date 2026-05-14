import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/dashboard/files/ingest-jobs?status=failed&limit=50
 *
 * Returns ingest attempts scoped to the caller's org. Default returns the
 * 50 most-recent failed jobs (DLQ view). Pass status=success or all to widen.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await resolveActiveOrg(request, session.user.id)
    if (!orgContext?.organizationId) {
      return NextResponse.json({ jobs: [] })
    }

    const url = new URL(request.url)
    const statusParam = url.searchParams.get("status") ?? "failed"
    const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10)
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 500)

    const jobs = await prisma.ingestJob.findMany({
      where: {
        organizationId: orgContext.organizationId,
        ...(statusParam !== "all" && { status: statusParam }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        filename: true,
        fileSize: true,
        mimeType: true,
        s3Key: true,
        documentId: true,
        error: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ jobs })
  } catch (error) {
    console.error("Failed to list ingest jobs:", error)
    return NextResponse.json({ error: "Failed to list ingest jobs" }, { status: 500 })
  }
}
