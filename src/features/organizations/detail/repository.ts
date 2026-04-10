import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

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

export async function findOrganizationDetailById(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
  })
}

export async function updateOrganizationById(
  organizationId: string,
  data: Prisma.OrganizationUpdateInput
) {
  return prisma.organization.update({
    where: { id: organizationId },
    data,
  })
}

export async function deleteOrganizationById(organizationId: string) {
  return prisma.organization.delete({
    where: { id: organizationId },
  })
}
