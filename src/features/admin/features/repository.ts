import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function listFeatureConfigs() {
  return prisma.featureConfig.findMany({
    orderBy: { feature: "asc" },
  })
}

export async function upsertFeatureConfig(params: {
  feature: string
  enabled?: boolean
  config?: Prisma.InputJsonValue
}) {
  return prisma.featureConfig.upsert({
    where: { feature: params.feature },
    create: {
      feature: params.feature,
      enabled: params.enabled ?? true,
      config: params.config ?? {},
    },
    update: {
      enabled: params.enabled,
      config: params.config,
    },
  })
}
