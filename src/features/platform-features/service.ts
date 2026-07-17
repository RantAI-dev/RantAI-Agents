import { findDashboardFeatureConfigs } from "./repository"

// Features that are completely disabled in cloud/enterprise edition (cannot be enabled)
const CLOUD_DISABLED_FEATURES = ["DIGITAL_EMPLOYEES"]

// Features that default to off in cloud edition (can be enabled via settings)
const CLOUD_DEFAULT_OFF_FEATURES = ["AGENT"]

// All gateable dashboard features.
const ALL_FEATURES = ["AGENT", "DIGITAL_EMPLOYEES", "MEDIA"]

/**
 * Per-deployment feature override from the environment — the rantai-enterprise
 * installer writes this so a client's build hides features by config (no rebuild,
 * no admin clicks). Comma-separated feature keys forced OFF, e.g.
 *   DISABLED_FEATURES=MEDIA,DIGITAL_EMPLOYEES,AGENT
 * Takes precedence over DB config and edition defaults.
 */
function envDisabledFeatures(): Set<string> {
  return new Set(
    (process.env.DISABLED_FEATURES ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  )
}

/**
 * Returns dashboard feature flags as a simple name -> enabled map.
 */
export async function getDashboardFeatures(): Promise<Record<string, boolean>> {
  const configs = await findDashboardFeatureConfigs()
  const result: Record<string, boolean> = {}
  const isCloudEdition = process.env.NEXT_PUBLIC_EDITION === "cloud"
  const disabled = envDisabledFeatures()

  for (const feature of ALL_FEATURES) {
    // Highest precedence: per-deployment env override.
    if (disabled.has(feature)) {
      result[feature] = false
      continue
    }

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
