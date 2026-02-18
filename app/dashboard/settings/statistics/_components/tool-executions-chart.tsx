"use client"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wrench } from "lucide-react"

const chartConfig = {
  count: {
    label: "Executions",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

interface ToolExecutionsChartProps {
  data: Array<{ date: string; count: number }>
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function ToolExecutionsChart({ data }: ToolExecutionsChartProps) {
  if (data.length === 0) {
    return (
      <Card className="border-l-2 border-l-chart-3/20">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4 text-chart-3" />
            Tool Executions Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
            No tool execution data for this period
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-2 border-l-chart-3/20">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wrench className="h-4 w-4 text-chart-3" />
          Tool Executions Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart data={data}>
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
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
