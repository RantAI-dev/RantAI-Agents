import { prisma } from "@/lib/prisma"

export async function findDashboardFeatureConfigs() {
  return prisma.featureConfig.findMany({
    select: { feature: true, enabled: true },
  })
}
