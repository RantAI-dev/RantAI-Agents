"use client"

import { DashboardPageHeader } from "../../_components/dashboard-page-header"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  MessageSquare,
  Users,
  Coins,
  Wrench,
  Bot,
  AlertTriangle,
  DollarSign,
  BarChart3,
} from "lucide-react"
import { useStatistics } from "@/hooks/use-statistics"
import { StatCard } from "./_components/stat-card"
import { DateRangePicker } from "./_components/date-range-picker"
import { ConversationsChart } from "./_components/conversations-chart"
import { TokenUsageChart } from "./_components/token-usage-chart"
import { ToolExecutionsChart } from "./_components/tool-executions-chart"
import {
  ChannelBreakdown,
  AssistantBreakdown,
} from "./_components/breakdown-charts"
import { cn } from "@/lib/utils"

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function getErrorRateColor(rate: number): string {
  if (rate < 5) return "text-green-600 dark:text-green-400"
  if (rate <= 20) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

export default function StatisticsPage() {
  const { data, filters, isLoading, updateFilters } = useStatistics()

  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader
        title="Statistics"
        subtitle="Analytics and usage metrics"
        actions={
          <DateRangePicker filters={filters} onUpdate={updateFilters} />
        }
      />

      <div className="flex-1 overflow-auto p-6 dot-grid-bg">
        {isLoading ? (
          <div className="animate-pulse space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-muted rounded-lg" />
              ))}
            </div>
            <div className="h-[300px] bg-muted rounded-lg" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-grid">
                <StatCard
                  title="Total Sessions"
                  value={formatNumber(data?.overview.totalSessions ?? 0)}
                  subtitle="Dashboard chat sessions"
                  icon={Users}
                  accent="chart-1"
                />
                <StatCard
                  title="Conversations"
                  value={formatNumber(data?.overview.totalConversations ?? 0)}
                  subtitle="Widget conversations"
                  icon={MessageSquare}
                  accent="chart-2"
                />
                <StatCard
                  title="Tool Executions"
                  value={formatNumber(data?.overview.totalToolExecutions ?? 0)}
                  subtitle={`${data?.overview.totalToolErrors ?? 0} errors`}
                  icon={Wrench}
                  accent="chart-3"
                />
                <StatCard
                  title="Assistants"
                  value={data?.overview.totalAssistants ?? 0}
                  subtitle="Configured"
                  icon={Bot}
                  accent="violet"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-grid">
                <StatCard
                  title="Total Tokens"
                  value={formatNumber(
                    (data?.overview.totalTokensInput ?? 0) +
                      (data?.overview.totalTokensOutput ?? 0)
                  )}
                  subtitle={`${formatNumber(data?.overview.totalTokensInput ?? 0)} in / ${formatNumber(data?.overview.totalTokensOutput ?? 0)} out`}
                  icon={Coins}
                  accent="amber"
                />
                <StatCard
                  title="Estimated Cost"
                  value={`$${(data?.overview.totalCost ?? 0).toFixed(2)}`}
                  subtitle="Based on usage records"
                  icon={DollarSign}
                  accent="cyan"
                />
                <StatCard
                  title="Usage Records"
                  value={formatNumber(data?.overview.totalUsageRecords ?? 0)}
                  subtitle="API calls tracked"
                  icon={BarChart3}
                  accent="chart-1"
                />
                <StatCard
                  title="Error Rate"
                  value={
                    data?.overview.totalToolExecutions
                      ? `${(((data.overview.totalToolErrors ?? 0) / data.overview.totalToolExecutions) * 100).toFixed(1)}%`
                      : "0%"
                  }
                  subtitle="Tool execution errors"
                  icon={AlertTriangle}
                  accent="primary"
                />
              </div>

              <ConversationsChart
                data={data?.timeSeries.conversations ?? []}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <ChannelBreakdown data={data?.breakdowns.byChannel ?? []} />
                <AssistantBreakdown
                  data={data?.breakdowns.byAssistant ?? []}
                />
              </div>
            </TabsContent>

            {/* Usage Tab */}
            <TabsContent value="usage" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3 stagger-grid">
                <StatCard
                  title="Input Tokens"
                  value={formatNumber(data?.overview.totalTokensInput ?? 0)}
                  icon={Coins}
                  accent="chart-1"
                />
                <StatCard
                  title="Output Tokens"
                  value={formatNumber(data?.overview.totalTokensOutput ?? 0)}
                  icon={Coins}
                  accent="chart-2"
                />
                <StatCard
                  title="Total Cost"
                  value={`$${(data?.overview.totalCost ?? 0).toFixed(2)}`}
                  icon={DollarSign}
                  accent="amber"
                />
              </div>

              <TokenUsageChart data={data?.timeSeries.tokenUsage ?? []} />

              <Card className="border-l-2 border-l-chart-1/20">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Sessions Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(data?.timeSeries.sessions ?? []).length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
                      No session data for this period
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {data?.timeSeries.sessions.map((s) => (
                        <div
                          key={s.date}
                          className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {new Date(s.date).toLocaleDateString()}
                          </span>
                          <span className="font-mono text-sm font-medium">
                            {s.count} <span className="text-muted-foreground text-xs">sessions</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tools Tab */}
            <TabsContent value="tools" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3 stagger-grid">
                <StatCard
                  title="Total Executions"
                  value={formatNumber(
                    data?.overview.totalToolExecutions ?? 0
                  )}
                  icon={Wrench}
                  accent="chart-3"
                />
                <StatCard
                  title="Errors"
                  value={data?.overview.totalToolErrors ?? 0}
                  icon={AlertTriangle}
                  accent="amber"
                />
                <StatCard
                  title="Error Rate"
                  value={
                    data?.overview.totalToolExecutions
                      ? `${(((data.overview.totalToolErrors ?? 0) / data.overview.totalToolExecutions) * 100).toFixed(1)}%`
                      : "0%"
                  }
                  icon={AlertTriangle}
                  accent="primary"
                />
              </div>

              <ToolExecutionsChart
                data={data?.timeSeries.toolExecutions ?? []}
              />

              <Card className="border-l-2 border-l-chart-3/20">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Tool Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(data?.breakdowns.byTool ?? []).length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
                      No tool execution data for this period
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tool</TableHead>
                          <TableHead className="text-right">
                            Executions
                          </TableHead>
                          <TableHead className="text-right">
                            Avg Duration
                          </TableHead>
                          <TableHead className="text-right">Errors</TableHead>
                          <TableHead className="text-right">
                            Error Rate
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.breakdowns.byTool.map((tool) => {
                          const errorRate = tool.count > 0
                            ? (tool.errorCount / tool.count) * 100
                            : 0
                          return (
                            <TableRow key={tool.name}>
                              <TableCell className="font-medium">
                                {tool.name}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {tool.count}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {tool.avgDurationMs}ms
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {tool.errorCount}
                              </TableCell>
                              <TableCell className={cn(
                                "text-right font-mono text-xs font-medium",
                                getErrorRateColor(errorRate)
                              )}>
                                {errorRate.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
