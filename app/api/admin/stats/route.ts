import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get conversation counts
    const [totalConversations, activeConversations, resolvedToday] =
      await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({
          where: {
            status: {
              in: ["WAITING_FOR_AGENT", "AGENT_CONNECTED"],
            },
          },
        }),
        prisma.conversation.count({
          where: {
            status: "RESOLVED",
            resolvedAt: {
              gte: today,
            },
          },
        }),
      ])

    // Get channel stats
    const channelCounts = await prisma.conversation.groupBy({
      by: ["channel"],
      _count: {
        channel: true,
      },
    })

    // Get channel configs
    const channelConfigs = await prisma.channelConfig.findMany()

    const channelStats = ["PORTAL", "SALESFORCE", "WHATSAPP", "EMAIL"].map(
      (channel) => {
        const count =
          channelCounts.find((c) => c.channel === channel)?._count?.channel || 0
        const config = channelConfigs.find((c) => c.channel === channel)
        return {
          channel,
          count,
          enabled: config?.enabled || channel === "PORTAL", // Portal is always available
        }
      }
    )

    // Calculate average response time (simplified - time from handoff to first agent message)
    const conversationsWithResponse = await prisma.conversation.findMany({
      where: {
        status: "RESOLVED",
        handoffAt: { not: null },
      },
      include: {
        messages: {
          where: { role: "AGENT" },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      take: 100,
      orderBy: { resolvedAt: "desc" },
    })

    let avgResponseTime = "N/A"
    const responseTimes = conversationsWithResponse
      .filter((c) => c.handoffAt && c.messages.length > 0)
      .map((c) => {
        const handoff = c.handoffAt!.getTime()
        const firstResponse = c.messages[0].createdAt.getTime()
        return (firstResponse - handoff) / 1000 / 60 // minutes
      })

    if (responseTimes.length > 0) {
      const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      if (avg < 1) {
        avgResponseTime = `${Math.round(avg * 60)}s`
      } else if (avg < 60) {
        avgResponseTime = `${Math.round(avg)}m`
      } else {
        avgResponseTime = `${Math.round(avg / 60)}h`
      }
    }

    return NextResponse.json({
      totalConversations,
      activeConversations,
      resolvedToday,
      avgResponseTime,
      channelStats,
    })
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    )
  }
}
