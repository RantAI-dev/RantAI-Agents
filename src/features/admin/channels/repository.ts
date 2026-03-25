import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function listChannelConfigs() {
  return prisma.channelConfig.findMany({
    orderBy: { channel: "asc" },
  })
}

export async function clearPrimaryChannelFlags() {
  await prisma.channelConfig.updateMany({
    where: { isPrimary: true },
    data: { isPrimary: false },
  })
}

export async function upsertChannelConfig(params: {
  channel: string
  enabled?: boolean
  isPrimary?: boolean
  config?: Prisma.InputJsonValue
}) {
  return prisma.channelConfig.upsert({
    where: { channel: params.channel },
    create: {
      channel: params.channel,
      enabled: params.enabled ?? false,
      isPrimary: params.isPrimary ?? false,
      config: params.config ?? {},
    },
    update: {
      enabled: params.enabled,
      isPrimary: params.isPrimary,
      config: params.config,
    },
  })
}
