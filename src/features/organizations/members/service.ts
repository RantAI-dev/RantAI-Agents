import {
  createOrganizationMember,
  deleteMember,
  findMemberByEmailInOrganization,
  findMemberById,
  findMembership,
  findMembersByOrganizationId,
  findOrganizationWithMemberCount,
  findUserByEmail,
  updateMemberRole,
} from "./repository"
import type { InviteMemberInput, UpdateMemberRoleInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface OrganizationMemberResponse {
  id: string
  userId: string
  email: string
  name: string | null
  role: string
  invitedBy: string | null
  invitedAt: string
  acceptedAt: string | null
  isPending: boolean
}

function toMemberResponse(member: {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  role: string
  invitedBy: string | null
  invitedAt: Date
  acceptedAt: Date | null
}): OrganizationMemberResponse {
  return {
    id: member.id,
    userId: member.userId,
    email: member.userEmail,
    name: member.userName,
    role: member.role,
    invitedBy: member.invitedBy,
    invitedAt: member.invitedAt.toISOString(),
    acceptedAt: member.acceptedAt?.toISOString() ?? null,
    isPending: !member.acceptedAt,
  }
}

/**
 * Lists all members in an organization for accepted members.
 */
export async function listOrganizationMembers(params: {
  actorUserId: string
  organizationId: string
}): Promise<OrganizationMemberResponse[] | ServiceError> {
  const membership = await findMembership(params.actorUserId, params.organizationId)
  if (!membership || !membership.acceptedAt) {
    return { status: 403, error: "Not a member" }
  }

  const members = await findMembersByOrganizationId(params.organizationId)
  return members.map(toMemberResponse)
}

/**
 * Invites a new member (owner/admin only) with org plan/limit checks.
 */
export async function inviteOrganizationMember(params: {
  actorUserId: string
  organizationId: string
  input: InviteMemberInput
}): Promise<OrganizationMemberResponse | ServiceError> {
  const membership = await findMembership(params.actorUserId, params.organizationId)
  if (!membership || !membership.acceptedAt) {
    return { status: 403, error: "Not a member" }
  }

  if (!["owner", "admin"].includes(membership.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const normalizedEmail = params.input.email.toLowerCase()

  const organization = await findOrganizationWithMemberCount(params.organizationId)
  if (!organization) {
    return { status: 404, error: "Organization not found" }
  }

  if (organization.plan === "free") {
    return {
      status: 403,
      error: "Organization management requires a paid plan. Please upgrade.",
    }
  }

  if (organization._count.memberships >= organization.maxMembers) {
    return {
      status: 400,
      error: `Organization has reached the maximum of ${organization.maxMembers} members`,
    }
  }

  const existingMember = await findMemberByEmailInOrganization(
    params.organizationId,
    normalizedEmail
  )
  if (existingMember) {
    return {
      status: 400,
      error: "This email is already a member or has a pending invite",
    }
  }

  const existingUser = await findUserByEmail(normalizedEmail)
  const member = await createOrganizationMember({
    userId: existingUser?.id ?? `pending-${Date.now()}`,
    userEmail: normalizedEmail,
    userName: existingUser?.name ?? null,
    organizationId: params.organizationId,
    role: params.input.role,
    invitedBy: params.actorUserId,
    acceptedAt: existingUser ? new Date() : null,
  })

  return toMemberResponse(member)
}

/**
 * Updates an organization member role (owner only, never on owner record).
 */
export async function changeOrganizationMemberRole(params: {
  actorUserId: string
  organizationId: string
  memberId: string
  input: UpdateMemberRoleInput
}): Promise<OrganizationMemberResponse | ServiceError> {
  const currentMembership = await findMembership(params.actorUserId, params.organizationId)
  if (!currentMembership || !currentMembership.acceptedAt) {
    return { status: 403, error: "Not a member" }
  }

  const targetMember = await findMemberById(params.memberId)
  if (!targetMember || targetMember.organizationId !== params.organizationId) {
    return { status: 404, error: "Member not found" }
  }

  if (targetMember.role === "owner") {
    return { status: 403, error: "Cannot change the owner's role" }
  }

  if (currentMembership.role !== "owner") {
    return { status: 403, error: "Only the owner can change member roles" }
  }

  const member = await updateMemberRole(params.memberId, params.input.role)
  return toMemberResponse(member)
}

/**
 * Removes a member from an organization with owner/admin constraints.
 */
export async function removeOrganizationMember(params: {
  actorUserId: string
  organizationId: string
  memberId: string
}): Promise<{ success: true } | ServiceError> {
  const currentMembership = await findMembership(params.actorUserId, params.organizationId)
  if (!currentMembership || !currentMembership.acceptedAt) {
    return { status: 403, error: "Not a member" }
  }

  const targetMember = await findMemberById(params.memberId)
  if (!targetMember || targetMember.organizationId !== params.organizationId) {
    return { status: 404, error: "Member not found" }
  }

  const isSelfRemoval = targetMember.userId === params.actorUserId

  if (!isSelfRemoval) {
    if (!["owner", "admin"].includes(currentMembership.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }

    if (targetMember.role === "owner") {
      return { status: 403, error: "Cannot remove the organization owner" }
    }

    if (targetMember.role === "admin" && currentMembership.role !== "owner") {
      return { status: 403, error: "Only the owner can remove admins" }
    }
  }

  if (isSelfRemoval && targetMember.role === "owner") {
    return {
      status: 403,
      error: "Owner cannot leave. Transfer ownership first or delete the organization.",
    }
  }

  await deleteMember(params.memberId)
  return { success: true }
}
