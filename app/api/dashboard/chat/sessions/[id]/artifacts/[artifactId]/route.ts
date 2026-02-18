import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadFile, deleteFile } from "@/lib/s3"

// PUT /api/dashboard/chat/sessions/[id]/artifacts/[artifactId] - Update artifact content
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, artifactId } = await params
    const body = await req.json()
    const { content, title } = body

    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      )
    }

    // Verify session ownership
    const chatSession = await prisma.dashboardSession.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!chatSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    // Fetch existing artifact
    const existing = await prisma.document.findFirst({
      where: { id: artifactId, sessionId: id, artifactType: { not: null } },
    })
    if (!existing) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      )
    }

    // Push old version to history
    const meta = (existing.metadata as Record<string, unknown>) || {}
    const versions = (meta.versions as Array<unknown>) || []
    versions.push({
      content: existing.content,
      title: existing.title,
      timestamp: Date.now(),
    })

    // Upload new content to S3
    if (existing.s3Key) {
      await uploadFile(
        existing.s3Key,
        Buffer.from(content, "utf-8"),
        existing.mimeType || "text/plain"
      )
    }

    // Update Document record
    const updated = await prisma.document.update({
      where: { id: artifactId },
      data: {
        content,
        title: title || existing.title,
        fileSize: Buffer.byteLength(content, "utf-8"),
        metadata: { ...meta, versions },
      },
    })

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      content: updated.content,
      artifactType: updated.artifactType,
      metadata: updated.metadata,
    })
  } catch (error) {
    console.error("[Artifact API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update artifact" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/chat/sessions/[id]/artifacts/[artifactId] - Delete artifact
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, artifactId } = await params

    // Verify session ownership
    const chatSession = await prisma.dashboardSession.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!chatSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    // Fetch artifact to get S3 key
    const existing = await prisma.document.findFirst({
      where: { id: artifactId, sessionId: id, artifactType: { not: null } },
    })
    if (!existing) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      )
    }

    // Delete S3 file
    if (existing.s3Key) {
      try {
        await deleteFile(existing.s3Key)
      } catch {
        // S3 delete failure is non-fatal
      }
    }

    // Delete Document record
    await prisma.document.delete({ where: { id: artifactId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Artifact API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete artifact" },
      { status: 500 }
    )
  }
}
