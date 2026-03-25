import { prisma } from "@/lib/prisma"

export async function findMembership(userId: string, organizationId: string) {
  return prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  })
}

export async function findMembersByOrganizationId(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId },
    orderBy: [{ role: "asc" }, { acceptedAt: "asc" }],
  })
}

export async function findOrganizationWithMemberCount(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      _count: { select: { memberships: true } },
    },
  })
}

export async function findMemberByEmailInOrganization(
  organizationId: string,
  userEmail: string
) {
  return prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userEmail,
    },
  })
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  })
}

export async function createOrganizationMember(data: {
  userId: string
  userEmail: string
  userName: string | null
  organizationId: string
  role: string
  invitedBy: string
  acceptedAt: Date | null
}) {
  return prisma.organizationMember.create({ data })
}

export async function findMemberById(memberId: string) {
  return prisma.organizationMember.findUnique({
    where: { id: memberId },
  })
}

export async function updateMemberRole(memberId: string, role: string) {
  return prisma.organizationMember.update({
    where: { id: memberId },
    data: { role },
  })
}

export async function deleteMember(memberId: string) {
  return prisma.organizationMember.delete({
    where: { id: memberId },
  })
}
