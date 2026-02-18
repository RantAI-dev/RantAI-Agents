"use client"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins } from "lucide-react"

const chartConfig = {
  input: {
    label: "Input Tokens",
    color: "var(--chart-1)",
  },
  output: {
    label: "Output Tokens",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

interface TokenUsageChartProps {
  data: Array<{ date: string; input: number; output: number }>
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function TokenUsageChart({ data }: TokenUsageChartProps) {
  if (data.length === 0) {
    return (
      <Card className="border-l-2 border-l-chart-1/20">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Coins className="h-4 w-4 text-chart-1" />
            Token Usage Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
            No token usage data for this period
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-2 border-l-chart-1/20">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Coins className="h-4 w-4 text-chart-1" />
          Token Usage Over Time
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
              dataKey="input"
              stackId="1"
              stroke="var(--color-input)"
              fill="var(--color-input)"
              fillOpacity={0.2}
              strokeWidth={2.5}
            />
            <Area
              type="monotone"
              dataKey="output"
              stackId="1"
              stroke="var(--color-output)"
              fill="var(--color-output)"
              fillOpacity={0.2}
              strokeWidth={2.5}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
