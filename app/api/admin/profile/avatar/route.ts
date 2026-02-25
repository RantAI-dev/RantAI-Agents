import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { downloadFile } from "@/lib/s3"

/**
 * GET /api/admin/profile/avatar - Proxy avatar image from S3
 *
 * Serves the current user's avatar image through Next.js,
 * so the browser doesn't need direct access to the S3 server.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avatarS3Key: true },
    })

    if (!user?.avatarS3Key) {
      return NextResponse.json({ error: "No avatar" }, { status: 404 })
    }

    const buffer = await downloadFile(user.avatarS3Key)

    // Infer content type from file extension
    const ext = user.avatarS3Key.split(".").pop()?.toLowerCase()
    const contentType =
      ext === "png" ? "image/png" :
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "webp" ? "image/webp" :
      "image/png"

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.error("[Avatar Proxy] Error:", error)
    return NextResponse.json({ error: "Failed to load avatar" }, { status: 500 })
  }
}
