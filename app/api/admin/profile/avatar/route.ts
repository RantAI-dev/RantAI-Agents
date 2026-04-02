import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getAdminAvatar,
  removeAdminAvatar,
  isServiceError,
} from "@/src/features/admin/profile/service"

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
    const result = await getAdminAvatar(session.user.id)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return new NextResponse(new Uint8Array(result.body), {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.error("[Avatar Proxy] Error:", error)
    return NextResponse.json({ error: "Failed to load avatar" }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/profile/avatar - Remove avatar from S3 and clear DB
 */
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await removeAdminAvatar(session.user.id)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Avatar Delete] Error:", error)
    return NextResponse.json({ error: "Failed to remove avatar" }, { status: 500 })
  }
}
