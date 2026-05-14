import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  ACTIVE_ORG_COOKIE,
  readActiveOrgCookieFromRequest,
} from "@/lib/active-org-cookie"

export type OrgRole = "owner" | "admin" | "member" | "viewer"

export interface ActiveOrgContext {
  organizationId: string
  /**
   * Nested for compatibility with the previous two-resolver shape, so call
   * sites don't have to be rewritten. `role` is also exposed at the top level
   * for new code.
   */
  membership: {
    id: string
    role: OrgRole
    userId: string
  }
  role: OrgRole
  /** Where the orgId came from — useful for tests and observability. */
  source: "header" | "cookie" | "auto"
}

const ROLE_VALUES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "member",
  "viewer",
])

function asOrgRole(value: string): OrgRole | null {
  return ROLE_VALUES.has(value) ? (value as OrgRole) : null
}

interface VerifiedMembership {
  organizationId: string
  role: OrgRole
  membershipId: string
  userId: string
}

async function verifyMembership(
  userId: string,
  organizationId: string
): Promise<VerifiedMembership | null> {
  const m = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { id: true, role: true, acceptedAt: true },
  })
  if (!m || !m.acceptedAt) return null
  const role = asOrgRole(m.role)
  if (!role) return null
  return { organizationId, role, membershipId: m.id, userId }
}

async function pickAutoMembership(userId: string): Promise<VerifiedMembership | null> {
  const m = await prisma.organizationMember.findFirst({
    where: { userId, acceptedAt: { not: null } },
    select: { id: true, role: true, organizationId: true },
    orderBy: { acceptedAt: "asc" },
  })
  if (!m) return null
  const role = asOrgRole(m.role)
  if (!role) return null
  return { organizationId: m.organizationId, role, membershipId: m.id, userId }
}

function buildContext(
  v: VerifiedMembership,
  source: ActiveOrgContext["source"]
): ActiveOrgContext {
  return {
    organizationId: v.organizationId,
    membership: { id: v.membershipId, role: v.role, userId: v.userId },
    role: v.role,
    source,
  }
}

/**
 * Resolve the user's active organization for a given request.
 *
 * Precedence:
 *   1. `x-organization-id` header (explicit override; tests, API tokens)
 *   2. `rantai-active-org` cookie (default for browser sessions)
 *   3. First accepted membership (auto-pick for new users)
 *
 * All branches verify that `userId` has an accepted membership in the resolved
 * org. Returns null if the user is unauthenticated, has no memberships, or the
 * requested org is invalid.
 *
 * This is the *only* org-context resolver in the codebase. Do not add new ones.
 */
export async function resolveActiveOrg(
  request: Request,
  userId: string
): Promise<ActiveOrgContext | null> {
  const headerOrg = request.headers.get("x-organization-id")?.trim()
  if (headerOrg) {
    const verified = await verifyMembership(userId, headerOrg)
    if (verified) return buildContext(verified, "header")
    // explicit override that doesn't pass → don't fall through silently
    return null
  }

  const cookieOrg = readActiveOrgCookieFromRequest(request)
  if (cookieOrg) {
    const verified = await verifyMembership(userId, cookieOrg)
    if (verified) return buildContext(verified, "cookie")
    // stale cookie — fall through to auto-pick instead of failing the request
  }

  const auto = await pickAutoMembership(userId)
  if (auto) return buildContext(auto, "auto")
  return null
}

/**
 * Server-component variant. Builds a Request shape from `headers()` so the
 * same resolver works for both API routes and SSR.
 */
export async function resolveActiveOrgServer(
  userId: string
): Promise<ActiveOrgContext | null> {
  const requestHeaders = await headers()
  const proxy = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  return resolveActiveOrg(proxy, userId)
}

/** Permission helpers — kept here so callers don't import from a deprecated file. */
export function canEdit(role: OrgRole): boolean {
  return role === "owner" || role === "admin" || role === "member"
}

export function canManage(role: OrgRole): boolean {
  return role === "owner" || role === "admin"
}

export function isOwner(role: OrgRole): boolean {
  return role === "owner"
}

export { ACTIVE_ORG_COOKIE }
