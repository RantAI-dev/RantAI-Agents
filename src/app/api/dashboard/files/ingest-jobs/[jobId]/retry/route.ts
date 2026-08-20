import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/dashboard/files/ingest-jobs/:jobId/retry
 *
 * Re-queue a failed ingest job. The file is still in S3 (kept on failure), so
 * the worker replays it — resets the job to "pending" and the Document back to
 * "processing". Org-scoped; only "failed" jobs with a stored file can retry.
 */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { jobId } = await params
    const orgContext = await resolveActiveOrg(request, session.user.id)

    const job = await prisma.ingestJob.findUnique({
      where: { id: jobId },
      select: { id: true, organizationId: true, status: true, s3Key: true, documentId: true, attempt: true },
    })

    if (!job || job.organizationId !== (orgContext?.organizationId ?? null)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (job.status !== "failed") {
      return NextResponse.json({ error: "Only failed jobs can be retried" }, { status: 409 })
    }
    if (!job.s3Key || !job.documentId) {
      return NextResponse.json({ error: "Job is missing its stored file; re-upload instead" }, { status: 422 })
    }
    // Bounded: attempt used to reset to 1 here, which let a permanently-bad
    // file be retried forever. Cap total attempts and tell the user plainly.
    const MAX_USER_RETRIES = 5
    if ((job.attempt ?? 1) >= MAX_USER_RETRIES) {
      return NextResponse.json(
        { error: "Retry limit reached for this file — please re-upload it." },
        { status: 409 }
      )
    }

    await prisma.ingestJob.update({
      where: { id: job.id },
      data: { status: "pending", attempt: { increment: 1 }, error: null, step: "queued", progress: 0, startedAt: null, etaSeconds: null },
    })
    await prisma.document.update({ where: { id: job.documentId }, data: { status: "processing" } })

    return NextResponse.json({ ok: true, jobId: job.id, documentId: job.documentId })
  } catch (error) {
    console.error("Failed to retry ingest job:", error)
    return NextResponse.json({ error: "Failed to retry ingest job" }, { status: 500 })
  }
}
