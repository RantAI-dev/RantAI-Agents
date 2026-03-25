import { Prisma } from "@prisma/client"
import { ADMIN_FEATURES, type UpdateAdminFeatureInput } from "./schema"
import { listFeatureConfigs, upsertFeatureConfig } from "./repository"

/**
 * Returns feature settings with defaults for any missing feature.
 */
export async function getAdminFeatures(): Promise<Array<Record<string, unknown>>> {
  const features = await listFeatureConfigs()

  return ADMIN_FEATURES.map((feature) => {
    const existing = features.find((row) => row.feature === feature)
    if (existing) {
      return existing
    }

    return {
      id: null,
      feature,
      enabled: true,
      config: {},
      createdAt: null,
      updatedAt: null,
    }
  })
}

/**
 * Upserts one feature configuration.
 */
export async function updateAdminFeature(
  input: UpdateAdminFeatureInput
): Promise<Record<string, unknown>> {
  return upsertFeatureConfig({
    feature: input.feature,
    enabled: input.enabled,
    config: input.config as Prisma.InputJsonValue | undefined,
  })
}
