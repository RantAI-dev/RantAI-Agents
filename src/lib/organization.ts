import { prisma } from "@/lib/prisma"

export interface OrganizationContext {
  organizationId: string
  membership: {
    id: string
    role: string
    userId: string
  }
}

/**
 * Get organization context from request headers and verify membership.
 * Returns null if no organization specified or user is not a member.
 */
export async function getOrganizationContext(
  request: Request,
  userId: string
): Promise<OrganizationContext | null> {
  const organizationId = request.headers.get("x-organization-id")

  if (!organizationId) {
    return null
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    select: {
      id: true,
      role: true,
      userId: true,
      acceptedAt: true,
    },
  })

  // Must be an accepted member
  if (!membership || !membership.acceptedAt) {
    return null
  }

  return {
    organizationId,
    membership: {
      id: membership.id,
      role: membership.role,
      userId: membership.userId,
    },
  }
}

/**
 * Like getOrganizationContext but falls back to user's first accepted org
 * when no x-organization-id header is present.
 */
export async function getOrganizationContextWithFallback(
  request: Request,
  userId: string
): Promise<OrganizationContext | null> {
  const ctx = await getOrganizationContext(request, userId)
  if (ctx) return ctx

  const membership = await prisma.organizationMember.findFirst({
    where: { userId, acceptedAt: { not: null } },
    select: { id: true, role: true, userId: true, organizationId: true },
  })
  if (!membership) return null

  return {
    organizationId: membership.organizationId,
    membership: { id: membership.id, role: membership.role, userId: membership.userId },
  }
}

/**
 * Check if user can edit resources (owner, admin, or member)
 */
export function canEdit(role: string): boolean {
  return ["owner", "admin", "member"].includes(role)
}

/**
 * Check if user can manage (owner or admin only)
 */
export function canManage(role: string): boolean {
  return ["owner", "admin"].includes(role)
}

/**
 * Check if user is owner
 */
export function isOwner(role: string): boolean {
  return role === "owner"
}
