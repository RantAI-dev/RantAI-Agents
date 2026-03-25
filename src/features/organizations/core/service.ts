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
  plan: string
  role: string
  limits: {
    maxMembers: number
    maxAssistants: number
    maxDocuments: number
    maxApiKeys: number
  }
  counts: {
    members: number
    assistants: number
    documents: number
    apiKeys: number
  }
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
    plan: membership.organization.plan,
    role: membership.role,
    limits: {
      maxMembers: membership.organization.maxMembers,
      maxAssistants: membership.organization.maxAssistants,
      maxDocuments: membership.organization.maxDocuments,
      maxApiKeys: membership.organization.maxApiKeys,
    },
    counts: {
      members: membership.organization._count.memberships,
      assistants: membership.organization._count.assistants,
      documents: membership.organization._count.documents,
      apiKeys: membership.organization._count.embedKeys,
    },
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
    plan: organization.plan,
    role: "owner",
    limits: {
      maxMembers: organization.maxMembers,
      maxAssistants: organization.maxAssistants,
      maxDocuments: organization.maxDocuments,
      maxApiKeys: organization.maxApiKeys,
    },
    counts: {
      members: organization._count.memberships,
      assistants: organization._count.assistants,
      documents: organization._count.documents,
      apiKeys: organization._count.embedKeys,
    },
    createdAt: organization.createdAt.toISOString(),
    joinedAt: undefined,
  }
}
