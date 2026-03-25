import { findDashboardFeatureConfigs } from "./repository"

/**
 * Returns dashboard feature flags as a simple name -> enabled map.
 */
export async function getDashboardFeatures(): Promise<Record<string, boolean>> {
  const configs = await findDashboardFeatureConfigs()
  const result: Record<string, boolean> = {}
  const allFeatures = ["AGENT"]

  for (const feature of allFeatures) {
    const existing = configs.find((config) => config.feature === feature)
    result[feature] = existing ? existing.enabled : true
  }

  return result
}
