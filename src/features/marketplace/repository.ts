import { prisma } from "@/lib/prisma"

export async function findDashboardMarketplaceInstallsByOrganization(
  organizationId: string
) {
  return prisma.marketplaceInstall.findMany({
    where: { organizationId },
    select: {
      catalogItemId: true,
      installedId: true,
      itemType: true,
    },
  })
}

export async function findDashboardMarketplaceInstallByCatalogItemAndOrganization(
  catalogItemId: string,
  organizationId: string
) {
  return prisma.marketplaceInstall.findFirst({
    where: {
      catalogItemId,
      organizationId,
    },
    select: {
      id: true,
      catalogItemId: true,
      installedId: true,
      itemType: true,
      organizationId: true,
      createdAt: true,
    },
  })
}

export async function findDashboardMarketplaceInstalledSkillsByIds(
  installedIds: string[]
) {
  return prisma.installedSkill.findMany({
    where: { id: { in: installedIds } },
    select: { id: true, skillId: true },
  })
}
