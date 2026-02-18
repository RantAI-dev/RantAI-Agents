"use client"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MessageSquare } from "lucide-react"

const chartConfig = {
  count: {
    label: "Conversations",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

interface ConversationsChartProps {
  data: Array<{ date: string; count: number }>
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function ConversationsChart({ data }: ConversationsChartProps) {
  if (data.length === 0) {
    return (
      <Card className="border-l-2 border-l-chart-1/20">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-chart-1" />
            Conversations Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
            No conversation data for this period
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-2 border-l-chart-1/20">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-chart-1" />
          Conversations Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} className="stroke-muted/30" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              className="font-mono"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              allowDecimals={false}
              className="font-mono"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(val) => formatDate(val as string)}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-count)"
              fill="var(--color-count)"
              fillOpacity={0.15}
              strokeWidth={2.5}
              className="chart-glow"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
