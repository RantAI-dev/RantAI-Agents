import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const url = new URL(req.url)

    const now = new Date()
    const fromParam = url.searchParams.get("from")
    const toParam = url.searchParams.get("to")
    const groupBy = url.searchParams.get("groupBy") || "day"

    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const to = toParam ? new Date(toParam) : now

    const orgId = orgContext?.organizationId ?? null

    // Build org filter for each model
    const orgFilter = orgId ? { organizationId: orgId } : {}
    const dateFilter = { createdAt: { gte: from, lte: to } }

    // Parallel overview queries
    const [
      totalSessions,
      totalConversations,
      conversationsByChannel,
      tokenAggregates,
      totalToolExecutions,
      totalAssistants,
      toolExecutionErrors,
    ] = await Promise.all([
      prisma.dashboardSession.count({
        where: { ...orgFilter, ...dateFilter },
      }),
      prisma.conversation.count({
        where: dateFilter,
      }),
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

    // Time-series queries using raw SQL with date_trunc
    const truncUnit = groupBy === "week" ? "week" : groupBy === "month" ? "month" : "day"

    const [
      conversationTimeSeries,
      tokenTimeSeries,
      toolExecutionTimeSeries,
      sessionTimeSeries,
    ] = await Promise.all([
      // Conversations over time
      prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
        FROM "Conversation"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY date
        ORDER BY date
      `,
      // Token usage over time
      orgId
        ? prisma.$queryRaw<Array<{ date: Date; input: bigint; output: bigint }>>`
            SELECT date_trunc(${truncUnit}, "createdAt") as date,
              COALESCE(sum("tokensInput"), 0)::bigint as input,
              COALESCE(sum("tokensOutput"), 0)::bigint as output
            FROM "UsageRecord"
            WHERE "organizationId" = ${orgId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY date
            ORDER BY date
          `
        : prisma.$queryRaw<Array<{ date: Date; input: bigint; output: bigint }>>`
            SELECT date_trunc(${truncUnit}, "createdAt") as date,
              COALESCE(sum("tokensInput"), 0)::bigint as input,
              COALESCE(sum("tokensOutput"), 0)::bigint as output
            FROM "UsageRecord"
            WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY date
            ORDER BY date
          `,
      // Tool executions over time
      orgId
        ? prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
            SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
            FROM "ToolExecution"
            WHERE "organizationId" = ${orgId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY date
            ORDER BY date
          `
        : prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
            SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
            FROM "ToolExecution"
            WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY date
            ORDER BY date
          `,
      // Sessions over time
      orgId
        ? prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
            SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
            FROM "DashboardSession"
            WHERE "organizationId" = ${orgId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY date
            ORDER BY date
          `
        : prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
            SELECT date_trunc(${truncUnit}, "createdAt") as date, count(*)::bigint as count
            FROM "DashboardSession"
            WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY date
            ORDER BY date
          `,
    ])

    // Breakdown queries
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

    // Resolve assistant names
    const assistantIds = byAssistant.map((a) => a.assistantId)
    const assistants = assistantIds.length > 0
      ? await prisma.assistant.findMany({
          where: { id: { in: assistantIds } },
          select: { id: true, name: true, emoji: true },
        })
      : []
    const assistantMap = new Map(assistants.map((a) => [a.id, a]))

    // Tool error rates
    const toolErrors = await prisma.toolExecution.groupBy({
      by: ["toolName"],
      where: { ...orgFilter, ...dateFilter, status: "error" },
      _count: true,
    })
    const toolErrorMap = new Map(toolErrors.map((t) => [t.toolName, t._count]))

    // Serialize bigints
    const serializeTS = (rows: Array<{ date: Date; count: bigint }>) =>
      rows.map((r) => ({ date: r.date.toISOString(), count: Number(r.count) }))

    const serializeTokenTS = (rows: Array<{ date: Date; input: bigint; output: bigint }>) =>
      rows.map((r) => ({
        date: r.date.toISOString(),
        input: Number(r.input),
        output: Number(r.output),
      }))

    return NextResponse.json({
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
        byChannel: conversationsByChannel.map((c) => ({
          channel: c.channel,
          count: c._count,
        })),
        byTool: byTool.map((t) => ({
          name: t.toolName,
          count: t._count,
          avgDurationMs: Math.round(t._avg.durationMs ?? 0),
          errorCount: toolErrorMap.get(t.toolName) ?? 0,
        })),
        byAssistant: byAssistant.map((a) => {
          const info = assistantMap.get(a.assistantId)
          return {
            id: a.assistantId,
            name: info?.name ?? "Unknown",
            emoji: info?.emoji ?? "",
            count: a._count,
          }
        }),
      },
    })
  } catch (error) {
    console.error("[Statistics API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    )
  }
}
