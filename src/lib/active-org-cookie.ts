import { cookies } from "next/headers"

export const ACTIVE_ORG_COOKIE = "rantai-active-org"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * Read the active-org cookie from the current server request.
 *
 * Server-only — uses next/headers cookies().
 */
export async function readActiveOrgCookie(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(ACTIVE_ORG_COOKIE)?.value
  return value && value.length > 0 ? value : null
}

/**
 * Read the active-org cookie from a plain Request object.
 *
 * Used by route handlers that already have `request: Request` in scope.
 * Parses Cookie header manually because Next.js's cookies() requires the
 * App Router context. This function works in both contexts.
 */
export function readActiveOrgCookieFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name === ACTIVE_ORG_COOKIE) {
      const raw = part.slice(eq + 1).trim()
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw || null
      }
    }
  }
  return null
}

/**
 * Set the active-org cookie. Lifetime is 1 year; HttpOnly so client JS can't
 * read it directly (writes go through the API). SameSite=Lax to allow normal
 * top-level navigation while blocking cross-site POSTs.
 */
export async function writeActiveOrgCookie(organizationId: string): Promise<void> {
  const store = await cookies()
  store.set({
    name: ACTIVE_ORG_COOKIE,
    value: organizationId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  })
}

export async function clearActiveOrgCookie(): Promise<void> {
  const store = await cookies()
  store.delete(ACTIVE_ORG_COOKIE)
}
