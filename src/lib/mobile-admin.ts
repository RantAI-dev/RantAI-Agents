import { getRequestUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

/**
 * Platform-admin gate for mobile admin routes. Verifies the bearer token, loads
 * the user, and requires system role ADMIN. Returns `{ user }` (usable as the
 * AdminActor for audit) or an `{ error, status }` to respond with.
 */
export async function requireMobileAdmin(
  request: Request,
): Promise<
  | { error: string; status: number }
  | { user: { id: string; email: string; name: string | null } }
> {
  const userId = await getRequestUserId(request)
  if (!userId) return { error: "Unauthorized", status: 401 }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!user || user.role !== "ADMIN") return { error: "Forbidden", status: 403 }

  return { user: { id: user.id, email: user.email, name: user.name } }
}
