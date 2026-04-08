import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { findJobById, cancelMediaJob } from "@/features/media/repository"

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await ctx.params
  const job = await findJobById(id)
  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (job.status !== "RUNNING" && job.status !== "PENDING") {
    return NextResponse.json({ error: "Job is not cancellable" }, { status: 409 })
  }
  const cancelled = await cancelMediaJob(id)
  return NextResponse.json(cancelled)
}
