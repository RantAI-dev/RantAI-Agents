import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { verifyAccessToken } from "@/lib/auth-mobile"
import {
  getOrganizationContextWithFallback,
  type OrganizationContext,
} from "@/lib/organization"

export interface AuthorizedRequest {
  user: { id: string }
  orgContext: OrganizationContext
  via: "session" | "mobile"
}

export async function requireUserAndOrg(
  req: Request,
): Promise<AuthorizedRequest | NextResponse> {
  // 1. Try NextAuth session cookie first (web).
  const session = await auth()
  if (session?.user?.id) {
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "No organization context" }, { status: 401 })
    }
    return { user: { id: session.user.id }, orgContext, via: "session" }
  }

  // 2. Fallback: mobile JWT Bearer token.
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim()
    try {
      const claims = await verifyAccessToken(token)
      const sess = await prisma.mobileSession.findUnique({
        where: { id: claims.sessionId },
        include: { user: { select: { id: true } } },
      })
      if (
        !sess ||
        sess.revokedAt ||
        sess.expiresAt < new Date() ||
        sess.userId !== claims.userId
      ) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 })
      }
      // Update lastUsedAt fire-and-forget — failure must not block the request.
      prisma.mobileSession
        .update({ where: { id: sess.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {})
      const orgContext = await getOrganizationContextWithFallback(req, sess.user.id)
      if (!orgContext) {
        return NextResponse.json({ error: "No organization context" }, { status: 401 })
      }
      return { user: { id: sess.user.id }, orgContext, via: "mobile" }
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
