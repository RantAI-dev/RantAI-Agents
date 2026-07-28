import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/dashboard/files/ingest-jobs/:jobId
 *
 * Current progress for one ingest job, org-scoped. Backs the socket-driven
 * `useIngestJobUpdates` hook (initial fetch on each event) and reload
 * hydration / polling fallback when the socket is unavailable.
 */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { jobId } = await params
    const orgContext = await resolveActiveOrg(request, session.user.id)

    const job = await prisma.ingestJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        step: true,
        progress: true,
        stepCurrent: true,
        stepTotal: true,
        etaSeconds: true,
        documentId: true,
        filename: true,
        error: true,
        attempt: true,
        updatedAt: true,
      },
    })

    if (!job || job.organizationId !== (orgContext?.organizationId ?? null)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { organizationId: _org, ...view } = job
    return NextResponse.json({ job: view })
  } catch (error) {
    console.error("Failed to fetch ingest job:", error)
    return NextResponse.json({ error: "Failed to fetch ingest job" }, { status: 500 })
  }
}
