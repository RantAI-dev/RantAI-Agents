"use client"

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts"
import type { ChartSpec, WorkbookValues } from "@/lib/spreadsheet/types"
import { resolveChartData } from "@/lib/spreadsheet/chart-data"

interface Props {
  charts: ChartSpec[]
  values: WorkbookValues
}

export function SheetChartView({ charts, values }: Props) {
  if (charts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
        No charts in this spec.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      {charts.map((chart) => (
        <ChartBlock key={chart.id} chart={chart} values={values} />
      ))}
    </div>
  )
}

function ChartBlock({ chart, values }: { chart: ChartSpec; values: WorkbookValues }) {
  const { rows, series } = resolveChartData(chart, values)

  if (rows.length === 0) {
    return (
      <div className="border rounded-md p-4 text-sm text-muted-foreground">
        {chart.title ?? chart.id}: no data resolved.
      </div>
    )
  }

  return (
    <div className="border rounded-md p-4 bg-background">
      {chart.title && (
        <h3 className="text-base font-semibold text-center mb-3">{chart.title}</h3>
      )}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(chart, rows, series)}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function renderChart(
  chart: ChartSpec,
  rows: Array<Record<string, string | number>>,
  series: Array<{ name: string; color: string }>,
): React.ReactElement {
  switch (chart.type) {
    case "bar":
      return (
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Bar key={s.name} dataKey={s.name} fill={s.color} stackId={chart.stacked ? "stack" : undefined} />
          ))}
        </BarChart>
      )
    case "line":
      return (
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} />
          ))}
        </LineChart>
      )
    case "area":
      return (
        <AreaChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Area key={s.name} type="monotone" dataKey={s.name} fill={s.color} stroke={s.color} fillOpacity={0.4} stackId={chart.stacked ? "stack" : undefined} />
          ))}
        </AreaChart>
      )
    case "pie": {
      // Pie uses only the first series; each row is a slice
      const seriesName = series[0]?.name ?? "value"
      return (
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie
            data={rows}
            dataKey={seriesName}
            nameKey="category"
            outerRadius={100}
            label
          >
            {rows.map((_row, i) => (
              <Cell key={i} fill={series[0]?.color ?? "#1a73e8"} fillOpacity={1 - i * 0.1} />
            ))}
          </Pie>
        </PieChart>
      )
    }
  }
}
