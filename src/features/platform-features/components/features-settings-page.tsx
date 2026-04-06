import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getAdminFeatures } from "@/features/admin/features/service"
import { getAdminChannels } from "@/features/admin/channels/service"
import FeaturesSettingsClient, {
  type ChannelConfig,
  type FeatureConfig,
} from "./features-settings-client"

function normalizeConfig(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = typeof entry === "string" ? entry : String(entry)
  }
  return result
}

function normalizeFeature(row: Record<string, unknown>): FeatureConfig {
  return {
    id: typeof row.id === "string" ? row.id : null,
    feature: typeof row.feature === "string" ? row.feature : "",
    enabled: Boolean(row.enabled),
    config: normalizeConfig(row.config),
  }
}

function normalizeChannel(row: Record<string, unknown>): ChannelConfig {
  return {
    id: typeof row.id === "string" ? row.id : null,
    channel: typeof row.channel === "string" ? row.channel : "",
    enabled: Boolean(row.enabled),
    isPrimary: Boolean(row.isPrimary),
    config: normalizeConfig(row.config),
  }
}

export default async function FeaturesSettingsPage() {
  const session = await auth()

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const [rawFeatures, rawChannels] = await Promise.all([
    getAdminFeatures(),
    getAdminChannels(),
  ])

  const initialFeatures = rawFeatures.map(normalizeFeature)
  const initialChannels = rawChannels.map(normalizeChannel)

  return (
    <FeaturesSettingsClient
      initialFeatures={initialFeatures}
      initialChannels={initialChannels}
    />
  )
}
