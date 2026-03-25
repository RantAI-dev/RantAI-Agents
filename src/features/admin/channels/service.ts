import { Prisma } from "@prisma/client"
import { ADMIN_CHANNELS, type UpdateAdminChannelInput } from "./schema"
import {
  clearPrimaryChannelFlags,
  listChannelConfigs,
  upsertChannelConfig,
} from "./repository"

/**
 * Returns channel settings with defaults for any missing channel.
 */
export async function getAdminChannels(): Promise<Array<Record<string, unknown>>> {
  const channels = await listChannelConfigs()

  return ADMIN_CHANNELS.map((channel) => {
    const existing = channels.find((row) => row.channel === channel)
    if (existing) {
      return existing
    }

    return {
      id: null,
      channel,
      enabled: channel === "PORTAL",
      isPrimary: channel === "PORTAL",
      config: {},
      createdAt: null,
      updatedAt: null,
    }
  })
}

/**
 * Upserts one channel configuration, preserving existing default behavior.
 */
export async function updateAdminChannel(
  input: UpdateAdminChannelInput
): Promise<Record<string, unknown>> {
  if (input.isPrimary) {
    await clearPrimaryChannelFlags()
  }

  return upsertChannelConfig({
    channel: input.channel,
    enabled: input.enabled,
    isPrimary: input.isPrimary,
    config: input.config as Prisma.InputJsonValue | undefined,
  })
}
