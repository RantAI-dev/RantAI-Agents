import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findDashboardCredentials(params: {
  organizationId: string | null
  userId: string
}) {
  return prisma.credential.findMany({
    where: {
      OR: [
        { organizationId: null, createdBy: params.userId },
        ...(params.organizationId ? [{ organizationId: params.organizationId }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      organizationId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findDashboardCredentialById(id: string) {
  return prisma.credential.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      organizationId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createDashboardCredential(data: Prisma.CredentialUncheckedCreateInput) {
  return prisma.credential.create({
    data,
    select: {
      id: true,
      name: true,
      type: true,
      organizationId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function updateDashboardCredential(
  id: string,
  data: Prisma.CredentialUpdateInput
) {
  return prisma.credential.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      type: true,
      organizationId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function deleteDashboardCredential(id: string) {
  return prisma.credential.delete({ where: { id } })
}
