import { prisma } from "@/lib/prisma"

function serializeTS(rows: Array<{ date: Date; count: bigint }>) {
  return rows.map((row) => ({
    date: row.date.toISOString(),
    count: Number(row.count),
  }))
}

function serializeTokenTS(rows: Array<{ date: Date; input: bigint; output: bigint }>) {
  return rows.map((row) => ({
    date: row.date.toISOString(),
    input: Number(row.input),
    output: Number(row.output),
  }))
}

export async function loadDashboardStatisticsData(params: {
  organizationId: string | null
  from: Date
  to: Date
  groupBy: "day" | "week" | "month"
}) {
  const orgId = params.organizationId
  const orgFilter = orgId ? { organizationId: orgId } : {}
  const dateFilter = { createdAt: { gte: params.from, lte: params.to } }
  const truncUnit = params.groupBy

  const [
    totalSessions,
    totalConversations,
    conversationsByChannel,
    tokenAggregates,
    totalToolExecutions,
    totalAssistants,
    toolExecutionErrors,
  ] = await Promise.all([
    prisma.dashboardSession.count({ where: { ...orgFilter, ...dateFilter } }),
    prisma.conversation.count({ where: dateFilter }),
    prisma.conversation.groupBy({
      by: ["channel"],
      where: dateFilter,
      _count: true,
    }),
    prisma.usageRecord.aggregate({
      where: { ...orgFilter, ...dateFilter },
      _sum: { tokensInput: true, tokensOutput: true, cost: true },
      _count: true,
    }),
    prisma.toolExecution.count({
      where: { ...orgFilter, ...dateFilter },
    }),
    orgId
      ? prisma.assistant.count({ where: { organizationId: orgId } })
      : prisma.assistant.count(),
    prisma.toolExecution.count({
      where: { ...orgFilter, ...dateFilter, status: "error" },
    }),
  ])

  const [
    conversationTimeSeries,
    tokenTimeSeries,
    toolExecutionTimeSeries,
    sessionTimeSeries,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
      FROM "Conversation"
      WHERE "createdAt" >= ${params.from} AND "createdAt" <= ${params.to}
      GROUP BY date
      ORDER BY date
    `,
    orgId
      ? prisma.$queryRaw<Array<{ date: Date; input: bigint; output: bigint }>>`
          SELECT date_trunc(${truncUnit}, "createdAt") as date,
            COALESCE(sum("tokensInput"), 0)::bigint as input,
            COALESCE(sum("tokensOutput"), 0)::bigint as output
          FROM "UsageRecord"
          WHERE "organizationId" = ${orgId} AND "createdAt" >= ${params.from} AND "createdAt" <= ${params.to}
          GROUP BY date
          ORDER BY date
        `
      : prisma.$queryRaw<Array<{ date: Date; input: bigint; output: bigint }>>`
          SELECT date_trunc(${truncUnit}, "createdAt") as date,
            COALESCE(sum("tokensInput"), 0)::bigint as input,
            COALESCE(sum("tokensOutput"), 0)::bigint as output
          FROM "UsageRecord"
          WHERE "createdAt" >= ${params.from} AND "createdAt" <= ${params.to}
          GROUP BY date
          ORDER BY date
        `,
    orgId
      ? prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
          FROM "ToolExecution"
          WHERE "organizationId" = ${orgId} AND "createdAt" >= ${params.from} AND "createdAt" <= ${params.to}
          GROUP BY date
          ORDER BY date
        `
      : prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
          FROM "ToolExecution"
          WHERE "createdAt" >= ${params.from} AND "createdAt" <= ${params.to}
          GROUP BY date
          ORDER BY date
        `,
    orgId
      ? prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
          FROM "DashboardSession"
          WHERE "organizationId" = ${orgId} AND "createdAt" >= ${params.from} AND "createdAt" <= ${params.to}
          GROUP BY date
          ORDER BY date
        `
      : prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
          FROM "DashboardSession"
          WHERE "createdAt" >= ${params.from} AND "createdAt" <= ${params.to}
          GROUP BY date
          ORDER BY date
        `,
  ])

  const [byTool, byAssistant] = await Promise.all([
    prisma.toolExecution.groupBy({
      by: ["toolName"],
      where: { ...orgFilter, ...dateFilter },
      _count: true,
      _avg: { durationMs: true },
      orderBy: { _count: { toolName: "desc" } },
      take: 10,
    }),
    orgId
      ? prisma.dashboardSession.groupBy({
          by: ["assistantId"],
          where: { organizationId: orgId, ...dateFilter },
          _count: true,
          orderBy: { _count: { assistantId: "desc" } },
          take: 10,
        })
      : prisma.dashboardSession.groupBy({
          by: ["assistantId"],
          where: dateFilter,
          _count: true,
          orderBy: { _count: { assistantId: "desc" } },
          take: 10,
        }),
  ])

  const assistantIds = byAssistant.map((assistant) => assistant.assistantId)
  const assistants = assistantIds.length > 0
    ? await prisma.assistant.findMany({
        where: { id: { in: assistantIds } },
        select: { id: true, name: true, emoji: true },
      })
    : []
  const assistantMap = new Map(assistants.map((assistant) => [assistant.id, assistant]))

  const toolErrors = await prisma.toolExecution.groupBy({
    by: ["toolName"],
    where: { ...orgFilter, ...dateFilter, status: "error" },
    _count: true,
  })
  const toolErrorMap = new Map(toolErrors.map((tool) => [tool.toolName, tool._count]))

  return {
    overview: {
      totalSessions,
      totalConversations,
      totalTokensInput: tokenAggregates._sum.tokensInput ?? 0,
      totalTokensOutput: tokenAggregates._sum.tokensOutput ?? 0,
      totalCost: tokenAggregates._sum.cost ? Number(tokenAggregates._sum.cost) : 0,
      totalUsageRecords: tokenAggregates._count,
      totalToolExecutions,
      totalToolErrors: toolExecutionErrors,
      totalAssistants,
    },
    timeSeries: {
      conversations: serializeTS(conversationTimeSeries),
      tokenUsage: serializeTokenTS(tokenTimeSeries),
      toolExecutions: serializeTS(toolExecutionTimeSeries),
      sessions: serializeTS(sessionTimeSeries),
    },
    breakdowns: {
      byChannel: conversationsByChannel.map((channel) => ({
        channel: channel.channel,
        count: channel._count,
      })),
      byTool: byTool.map((tool) => ({
        name: tool.toolName,
        count: tool._count,
        avgDurationMs: Math.round(tool._avg.durationMs ?? 0),
        errorCount: toolErrorMap.get(tool.toolName) || 0,
      })),
      byAssistant: byAssistant.map((assistant) => {
        const info = assistantMap.get(assistant.assistantId)
        return {
          assistantId: assistant.assistantId,
          name: info?.name || "Unknown",
          emoji: info?.emoji || null,
          count: assistant._count,
        }
      }),
    },
  }
}
