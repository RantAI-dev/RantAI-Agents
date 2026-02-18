"use client"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Radio, Bot } from "lucide-react"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

// Channel distribution pie chart
interface ChannelBreakdownProps {
  data: Array<{ channel: string; count: number }>
}

export function ChannelBreakdown({ data }: ChannelBreakdownProps) {
  if (data.length === 0) {
    return (
      <Card className="border-l-2 border-l-chart-1/20">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Radio className="h-4 w-4 text-chart-1" />
            Channel Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
            No channel data
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartConfig: ChartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.channel,
      { label: d.channel, color: COLORS[i % COLORS.length] },
    ])
  )

  return (
    <Card className="border-l-2 border-l-chart-1/20">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Radio className="h-4 w-4 text-chart-1" />
          Channel Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={data}
              dataKey="count"
              nameKey="channel"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="flex flex-wrap gap-3 justify-center mt-2">
          {data.map((d, i) => (
            <div key={d.channel} className="flex items-center gap-1.5 text-xs">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-muted-foreground">{d.channel}</span>
              <span className="font-mono font-bold">{d.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Assistant usage horizontal bar chart
interface AssistantBreakdownProps {
  data: Array<{ id: string; name: string; emoji: string; count: number }>
}

export function AssistantBreakdown({ data }: AssistantBreakdownProps) {
  if (data.length === 0) {
    return (
      <Card className="border-l-2 border-l-chart-2/20">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-chart-2" />
            Assistant Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
            No assistant data
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((d) => ({
    name: `${d.emoji} ${d.name}`,
    count: d.count,
  }))

  const chartConfig: ChartConfig = {
    count: {
      label: "Sessions",
      color: "var(--chart-2)",
    },
  }

  return (
    <Card className="border-l-2 border-l-chart-2/20">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bot className="h-4 w-4 text-chart-2" />
          Assistant Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={chartData} layout="vertical">
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tickLine={false}
              axisLine={false}
              fontSize={12}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[0, 6, 6, 0]}
              label={{ position: "right", fontSize: 11, className: "font-mono fill-muted-foreground" }}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
