import { findDashboardFeatureConfigs } from "./repository"

// Features that are completely disabled in cloud/enterprise edition (cannot be enabled)
const CLOUD_DISABLED_FEATURES = ["DIGITAL_EMPLOYEES"]

// Features that default to off in cloud edition (can be enabled via settings)
const CLOUD_DEFAULT_OFF_FEATURES = ["AGENT"]

/**
 * Returns dashboard feature flags as a simple name -> enabled map.
 */
export async function getDashboardFeatures(): Promise<Record<string, boolean>> {
  const configs = await findDashboardFeatureConfigs()
  const result: Record<string, boolean> = {}
  const allFeatures = ["AGENT", "DIGITAL_EMPLOYEES"]
  const isCloudEdition = process.env.NEXT_PUBLIC_EDITION === "cloud"

  for (const feature of allFeatures) {
    // Cloud edition completely disables certain features
    if (isCloudEdition && CLOUD_DISABLED_FEATURES.includes(feature)) {
      result[feature] = false
      continue
    }

    const existing = configs.find((config) => config.feature === feature)
    if (existing) {
      // Use stored config value
      result[feature] = existing.enabled
    } else {
      // Default: off for cloud default-off features, on otherwise
      result[feature] = isCloudEdition && CLOUD_DEFAULT_OFF_FEATURES.includes(feature) ? false : true
    }
  }

  return result
}
