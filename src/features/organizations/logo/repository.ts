import { prisma } from "@/lib/prisma"

export async function findOrganizationLogoFields(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: { logoS3Key: true, logoUrl: true },
  })
}

export async function updateOrganizationLogoKey(
  organizationId: string,
  logoS3Key: string
) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: { logoS3Key },
  })
}

export async function clearOrganizationLogo(organizationId: string) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      logoS3Key: null,
      logoUrl: null,
    },
  })
}
