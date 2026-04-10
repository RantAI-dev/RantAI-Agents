import {
  createOrganizationWithOwner,
  findAcceptedMembershipsByUserId,
  findOrganizationBySlug,
} from "./repository"
import type { CreateOrganizationInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface OrganizationListItem {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: string
  createdAt: string
  joinedAt: string | undefined
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Lists accepted organizations for one user.
 */
export async function listOrganizationsForUser(
  userId: string
): Promise<OrganizationListItem[]> {
  const memberships = await findAcceptedMembershipsByUserId(userId)
  return memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    logoUrl: membership.organization.logoUrl,
    role: membership.role,
    createdAt: membership.organization.createdAt.toISOString(),
    joinedAt: membership.acceptedAt?.toISOString(),
  }))
}

/**
 * Creates an organization and owner membership.
 */
export async function createOrganizationForUser(params: {
  input: CreateOrganizationInput
  userId: string
  userEmail: string
  userName?: string
}): Promise<OrganizationListItem | ServiceError> {
  const trimmedName = params.input.name.trim()
  if (trimmedName.length < 2) {
    return {
      status: 400,
      error: "Organization name must be at least 2 characters",
    }
  }

  let slug = params.input.slug?.trim() || generateSlug(trimmedName)
  const existing = await findOrganizationBySlug(slug)
  if (existing) {
    slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`
  }

  const organization = await createOrganizationWithOwner({
    name: trimmedName,
    slug,
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
  })

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logoUrl: organization.logoUrl,
    role: "owner",
    createdAt: organization.createdAt.toISOString(),
    joinedAt: undefined,
  }
}
