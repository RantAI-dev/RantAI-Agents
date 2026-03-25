import { ADMIN_CHANNELS } from "../channels/schema"
import {
  countActiveConversations,
  countResolvedConversationsSince,
  countTotalConversations,
  listChannelConfigs,
  listConversationChannelCounts,
  listResolvedConversationsWithFirstAgentMessage,
} from "./repository"

function formatAverageMinutes(avgMinutes: number): string {
  if (avgMinutes < 1) {
    return `${Math.round(avgMinutes * 60)}s`
  }
  if (avgMinutes < 60) {
    return `${Math.round(avgMinutes)}m`
  }
  return `${Math.round(avgMinutes / 60)}h`
}

/**
 * Aggregates admin dashboard stats.
 */
export async function getAdminStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalConversations, activeConversations, resolvedToday] = await Promise.all([
    countTotalConversations(),
    countActiveConversations(),
    countResolvedConversationsSince(today),
  ])

  const [channelCounts, channelConfigs, conversationsWithResponse] = await Promise.all([
    listConversationChannelCounts(),
    listChannelConfigs(),
    listResolvedConversationsWithFirstAgentMessage(),
  ])

  const channelStats = ADMIN_CHANNELS.map((channel) => {
    const count = channelCounts.find((entry) => entry.channel === channel)?._count.channel ?? 0
    const config = channelConfigs.find((entry) => entry.channel === channel)

    return {
      channel,
      count,
      enabled: config?.enabled || channel === "PORTAL",
    }
  })

  const responseTimesInMinutes = conversationsWithResponse
    .filter((conversation) => conversation.handoffAt && conversation.messages.length > 0)
    .map((conversation) => {
      const handoffAt = conversation.handoffAt!.getTime()
      const firstResponseAt = conversation.messages[0].createdAt.getTime()
      return (firstResponseAt - handoffAt) / 1000 / 60
    })

  const avgResponseTime =
    responseTimesInMinutes.length > 0
      ? formatAverageMinutes(
          responseTimesInMinutes.reduce((sum, current) => sum + current, 0) /
            responseTimesInMinutes.length
        )
      : "N/A"

  return {
    totalConversations,
    activeConversations,
    resolvedToday,
    avgResponseTime,
    channelStats,
  }
}
