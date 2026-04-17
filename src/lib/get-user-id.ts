import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { verifyAccessToken } from "@/lib/auth-mobile"

/**
 * Returns the authenticated user's id whether the caller is the web app
 * (NextAuth session cookie) or the mobile app (Authorization: Bearer <jwt>).
 * Returns null when neither path authenticates.
 *
 * Drop-in replacement for `await auth()` followed by `session?.user?.id`.
 */
export async function getUserId(req: Request): Promise<string | null> {
  const session = await auth()
  if (session?.user?.id) return session.user.id

  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  try {
    const claims = await verifyAccessToken(token)
    const sess = await prisma.mobileSession.findUnique({
      where: { id: claims.sessionId },
    })
    if (
      !sess ||
      sess.revokedAt ||
      sess.expiresAt < new Date() ||
      sess.userId !== claims.userId
    ) {
      return null
    }
    prisma.mobileSession
      .update({ where: { id: sess.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})
    return sess.userId
  } catch {
    return null
  }
}
