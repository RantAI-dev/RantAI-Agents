import type { Prisma } from "@prisma/client"
import {
  deleteOrganizationById,
  findMembership,
  findOrganizationDetailById,
  updateOrganizationById,
} from "./repository"
import type { UpdateOrganizationInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface OrganizationDetailResponse {
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
  updatedAt: string
}

function toOrganizationDetailResponse(params: {
  organization: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
    plan: string
    maxMembers: number
    maxAssistants: number
    maxDocuments: number
    maxApiKeys: number
    createdAt: Date
    updatedAt: Date
    _count: {
      memberships: number
      assistants: number
      documents: number
      embedKeys: number
    }
  }
  role: string
}): OrganizationDetailResponse {
  return {
    id: params.organization.id,
    name: params.organization.name,
    slug: params.organization.slug,
    logoUrl: params.organization.logoUrl,
    plan: params.organization.plan,
    role: params.role,
    limits: {
      maxMembers: params.organization.maxMembers,
      maxAssistants: params.organization.maxAssistants,
      maxDocuments: params.organization.maxDocuments,
      maxApiKeys: params.organization.maxApiKeys,
    },
    counts: {
      members: params.organization._count.memberships,
      assistants: params.organization._count.assistants,
      documents: params.organization._count.documents,
      apiKeys: params.organization._count.embedKeys,
    },
    createdAt: params.organization.createdAt.toISOString(),
    updatedAt: params.organization.updatedAt.toISOString(),
  }
}

/**
 * Loads organization detail for accepted members.
 */
export async function getOrganizationDetail(params: {
  actorUserId: string
  organizationId: string
}): Promise<OrganizationDetailResponse | ServiceError> {
  const membership = await findMembership(params.actorUserId, params.organizationId)
  if (!membership || !membership.acceptedAt) {
    return { status: 403, error: "Not a member" }
  }

  const organization = await findOrganizationDetailById(params.organizationId)
  if (!organization) {
    return { status: 404, error: "Organization not found" }
  }

  return toOrganizationDetailResponse({
    organization,
    role: membership.role,
  })
}

/**
 * Updates organization metadata for admin/owner roles.
 */
export async function updateOrganizationDetail(params: {
  actorUserId: string
  organizationId: string
  input: UpdateOrganizationInput
}): Promise<
  { id: string; name: string; slug: string; logoUrl: string | null; plan: string; updatedAt: string } | ServiceError
> {
  const membership = await findMembership(params.actorUserId, params.organizationId)
  if (!membership || !membership.acceptedAt) {
    return { status: 403, error: "Not a member" }
  }

  if (!["owner", "admin"].includes(membership.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const updateData: Prisma.OrganizationUpdateInput = {}
  if (params.input.name !== undefined) updateData.name = params.input.name.trim()
  if (params.input.logoUrl !== undefined) updateData.logoUrl = params.input.logoUrl

  const organization = await updateOrganizationById(params.organizationId, updateData)
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logoUrl: organization.logoUrl,
    plan: organization.plan,
    updatedAt: organization.updatedAt.toISOString(),
  }
}

/**
 * Deletes an organization; owner only.
 */
export async function deleteOrganizationDetail(params: {
  actorUserId: string
  organizationId: string
}): Promise<{ success: true } | ServiceError> {
  const membership = await findMembership(params.actorUserId, params.organizationId)
  if (!membership || !membership.acceptedAt) {
    return { status: 403, error: "Not a member" }
  }

  if (membership.role !== "owner") {
    return { status: 403, error: "Only the owner can delete an organization" }
  }

  await deleteOrganizationById(params.organizationId)
  return { success: true }
}
