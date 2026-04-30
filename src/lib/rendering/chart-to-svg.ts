/**
 * Chart to SVG renderer using D3.js
 *
 * Generates SVG strings for bar, bar-horizontal, line, pie, and donut charts.
 * Works both server-side (for HTML generation) and client-side (for PPTX export).
 *
 * D-51: themable. Pass `theme: "dark"` so the title/axis/gridline tokens
 * shift to a dark palette; data colours stay saturated either way (the
 * series remain brand-neutral).
 */

import * as d3Scale from "d3-scale"
import * as d3Shape from "d3-shape"
import type { ChartData, ChartDataPoint, ChartSeries } from "@/lib/slides/types"

// Default color palette (matches mermaid-config.ts pie colors)
const DEFAULT_COLORS = [
  "#3b82f6", // blue-500
  "#22c55e", // green-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
]

export type ChartTheme = "light" | "dark"

interface ThemeTokens {
  background: string
  title: string
  text: string
  muted: string
  gridline: string
  axis: string
  emptyBg: string
  emptyText: string
}

const TOKENS: Record<ChartTheme, ThemeTokens> = {
  light: {
    background: "#ffffff",
    title: "#1e293b",
    text: "#64748b",
    muted: "#94a3b8",
    gridline: "#e2e8f0",
    axis: "#cbd5e1",
    emptyBg: "#f8fafc",
    emptyText: "#94a3b8",
  },
  dark: {
    background: "#0b0b0c",
    title: "#f1f5f9",
    text: "#cbd5e1",
    muted: "#94a3b8",
    gridline: "#334155",
    axis: "#475569",
    emptyBg: "#1e293b",
    emptyText: "#94a3b8",
  },
}

function getColor(index: number, customColor?: string): string {
  return customColor || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

interface ChartDimensions {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  innerWidth: number
  innerHeight: number
}

function getDimensions(
  width: number,
  height: number,
  hasYAxis = true
): ChartDimensions {
  const margin = {
    top: 40,
    right: 20,
    bottom: 50,
    left: hasYAxis ? 60 : 20,
  }
  return {
    width,
    height,
    margin,
    innerWidth: width - margin.left - margin.right,
    innerHeight: height - margin.top - margin.bottom,
  }
}

function renderTitle(title: string | undefined, width: number, t: ThemeTokens): string {
  if (!title) return ""
  return `<text x="${width / 2}" y="20" text-anchor="middle" font-size="16" font-weight="600" fill="${t.title}">${escapeXml(title)}</text>`
}

function renderBarChart(
  data: ChartDataPoint[],
  dims: ChartDimensions,
  t: ThemeTokens,
  title?: string,
  showValues = true
): string {
  const { width, height, margin, innerWidth, innerHeight } = dims

  const xScale = d3Scale
    .scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([0, innerWidth])
    .padding(0.3)

  const maxValue = Math.max(...data.map((d) => d.value))
  const yScale = d3Scale
    .scaleLinear()
    .domain([0, maxValue * 1.1])
    .range([innerHeight, 0])

  const bars = data
    .map((d, i) => {
      const x = xScale(d.label) || 0
      const y = yScale(d.value)
      const barHeight = innerHeight - y
      const color = getColor(i, d.color)
      const valueText = showValues
        ? `<text x="${x + xScale.bandwidth() / 2}" y="${y - 5}" text-anchor="middle" font-size="11" fill="${t.text}">${d.value.toLocaleString()}</text>`
        : ""
      return `<rect x="${x}" y="${y}" width="${xScale.bandwidth()}" height="${barHeight}" fill="${color}" rx="4"/>${valueText}`
    })
    .join("")

  const xAxisLabels = data
    .map((d) => {
      const x = (xScale(d.label) || 0) + xScale.bandwidth() / 2
      return `<text x="${x}" y="${innerHeight + 20}" text-anchor="middle" font-size="12" fill="${t.text}">${escapeXml(d.label)}</text>`
    })
    .join("")

  // Y-axis ticks
  const yTicks = yScale.ticks(5)
  const yAxisTicks = yTicks
    .map(
      (tick) =>
        `<text x="-10" y="${yScale(tick)}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="${t.muted}">${tick.toLocaleString()}</text>
         <line x1="0" y1="${yScale(tick)}" x2="${innerWidth}" y2="${yScale(tick)}" stroke="${t.gridline}" stroke-dasharray="4"/>`
    )
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${t.background}"/>
    ${renderTitle(title, width, t)}
    <g transform="translate(${margin.left},${margin.top})">
      ${yAxisTicks}
      ${bars}
      ${xAxisLabels}
      <line x1="0" y1="${innerHeight}" x2="${innerWidth}" y2="${innerHeight}" stroke="${t.axis}"/>
    </g>
  </svg>`
}

function renderBarHorizontalChart(
  data: ChartDataPoint[],
  dims: ChartDimensions,
  t: ThemeTokens,
  title?: string,
  showValues = true
): string {
  const { width, height, margin, innerWidth, innerHeight } = dims

  const yScale = d3Scale
    .scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([0, innerHeight])
    .padding(0.3)

  const maxValue = Math.max(...data.map((d) => d.value))
  const xScale = d3Scale
    .scaleLinear()
    .domain([0, maxValue * 1.1])
    .range([0, innerWidth])

  const bars = data
    .map((d, i) => {
      const y = yScale(d.label) || 0
      const barWidth = xScale(d.value)
      const color = getColor(i, d.color)
      const valueText = showValues
        ? `<text x="${barWidth + 8}" y="${y + yScale.bandwidth() / 2}" dominant-baseline="middle" font-size="11" fill="${t.text}">${d.value.toLocaleString()}</text>`
        : ""
      return `<rect x="0" y="${y}" width="${barWidth}" height="${yScale.bandwidth()}" fill="${color}" rx="4"/>${valueText}`
    })
    .join("")

  const yAxisLabels = data
    .map((d) => {
      const y = (yScale(d.label) || 0) + yScale.bandwidth() / 2
      return `<text x="-10" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="12" fill="${t.text}">${escapeXml(d.label)}</text>`
    })
    .join("")

  // X-axis ticks
  const xTicks = xScale.ticks(5)
  const xAxisTicks = xTicks
    .map(
      (tick) =>
        `<text x="${xScale(tick)}" y="${innerHeight + 20}" text-anchor="middle" font-size="11" fill="${t.muted}">${tick.toLocaleString()}</text>
         <line x1="${xScale(tick)}" y1="0" x2="${xScale(tick)}" y2="${innerHeight}" stroke="${t.gridline}" stroke-dasharray="4"/>`
    )
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${t.background}"/>
    ${renderTitle(title, width, t)}
    <g transform="translate(${margin.left},${margin.top})">
      ${xAxisTicks}
      ${bars}
      ${yAxisLabels}
      <line x1="0" y1="${innerHeight}" x2="${innerWidth}" y2="${innerHeight}" stroke="${t.axis}"/>
    </g>
  </svg>`
}

function renderLineChart(
  labels: string[],
  series: ChartSeries[],
  dims: ChartDimensions,
  t: ThemeTokens,
  title?: string,
  showLegend = true
): string {
  const { width, height, margin, innerWidth, innerHeight } = dims

  const xScale = d3Scale
    .scalePoint<string>()
    .domain(labels)
    .range([0, innerWidth])
    .padding(0.5)

  const allValues = series.flatMap((s) => s.values)
  const maxValue = Math.max(...allValues)
  const minValue = Math.min(0, Math.min(...allValues))
  const yScale = d3Scale
    .scaleLinear()
    .domain([minValue, maxValue * 1.1])
    .range([innerHeight, 0])

  const lineGenerator = d3Shape
    .line<number>()
    .x((_, i) => xScale(labels[i]) || 0)
    .y((d) => yScale(d))
    .curve(d3Shape.curveMonotoneX)

  const lines = series
    .map((s, seriesIndex) => {
      const color = getColor(seriesIndex, s.color)
      const pathD = lineGenerator(s.values) || ""

      // Draw points
      const points = s.values
        .map((v, i) => {
          const x = xScale(labels[i]) || 0
          const y = yScale(v)
          return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="white" stroke-width="2"/>`
        })
        .join("")

      return `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5"/>${points}`
    })
    .join("")

  const xAxisLabels = labels
    .map((label) => {
      const x = xScale(label) || 0
      return `<text x="${x}" y="${innerHeight + 20}" text-anchor="middle" font-size="12" fill="${t.text}">${escapeXml(label)}</text>`
    })
    .join("")

  // Y-axis ticks
  const yTicks = yScale.ticks(5)
  const yAxisTicks = yTicks
    .map(
      (tick) =>
        `<text x="-10" y="${yScale(tick)}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="${t.muted}">${tick.toLocaleString()}</text>
         <line x1="0" y1="${yScale(tick)}" x2="${innerWidth}" y2="${yScale(tick)}" stroke="${t.gridline}" stroke-dasharray="4"/>`
    )
    .join("")

  // Legend
  const legendItems = showLegend
    ? series
        .map((s, i) => {
          const color = getColor(i, s.color)
          const x = margin.left + i * 100
          return `<rect x="${x}" y="${height - 20}" width="12" height="12" fill="${color}" rx="2"/>
                  <text x="${x + 18}" y="${height - 10}" font-size="11" fill="${t.text}">${escapeXml(s.name)}</text>`
        })
        .join("")
    : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${t.background}"/>
    ${renderTitle(title, width, t)}
    <g transform="translate(${margin.left},${margin.top})">
      ${yAxisTicks}
      ${lines}
      ${xAxisLabels}
      <line x1="0" y1="${innerHeight}" x2="${innerWidth}" y2="${innerHeight}" stroke="${t.axis}"/>
    </g>
    ${legendItems}
  </svg>`
}

function renderPieChart(
  data: ChartDataPoint[],
  width: number,
  height: number,
  t: ThemeTokens,
  title?: string,
  isDonut = false
): string {
  const centerX = width / 2
  const centerY = height / 2 + 10
  const radius = Math.min(width, height) / 2 - 60
  const innerRadius = isDonut ? radius * 0.5 : 0

  const total = data.reduce((sum, d) => sum + d.value, 0)

  const arcGenerator = d3Shape
    .arc<d3Shape.PieArcDatum<ChartDataPoint>>()
    .innerRadius(innerRadius)
    .outerRadius(radius)
    .padAngle(0.02)
    .cornerRadius(4)

  const pieGenerator = d3Shape
    .pie<ChartDataPoint>()
    .value((d) => d.value)
    .sort(null)

  const arcs = pieGenerator(data)

  const slices = arcs
    .map((arc, i) => {
      const color = getColor(i, arc.data.color)
      const pathD = arcGenerator(arc) || ""

      // Label position
      const labelArc = d3Shape
        .arc<d3Shape.PieArcDatum<ChartDataPoint>>()
        .innerRadius(radius * 0.7)
        .outerRadius(radius * 0.7)
      const [labelX, labelY] = labelArc.centroid(arc)

      const percentage = ((arc.data.value / total) * 100).toFixed(1)

      return `<path d="${pathD}" fill="${color}"/>
              <text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="white" font-weight="500">${percentage}%</text>`
    })
    .join("")

  // Legend below the chart
  const legendY = height - 30
  const legendSpacing = 120
  const legendStartX = (width - data.length * legendSpacing) / 2 + 20

  const legend = data
    .map((d, i) => {
      const color = getColor(i, d.color)
      const x = legendStartX + i * legendSpacing
      return `<rect x="${x}" y="${legendY}" width="12" height="12" fill="${color}" rx="2"/>
              <text x="${x + 18}" y="${legendY + 10}" font-size="11" fill="${t.text}">${escapeXml(d.label)}</text>`
    })
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${t.background}"/>
    ${renderTitle(title, width, t)}
    <g transform="translate(${centerX},${centerY})">
      ${slices}
    </g>
    ${legend}
  </svg>`
}

/**
 * Convert ChartData to SVG string.
 *
 * D-51: pass `options.theme: "dark"` to render with the dark palette
 * (slide deck on dark theme, etc.). Defaults to `"light"` so existing
 * callers keep their current output verbatim.
 */
export function chartToSvg(
  chart: ChartData,
  width = 600,
  height = 400,
  options?: { theme?: ChartTheme }
): string {
  const t = TOKENS[options?.theme ?? "light"]
  const { type, title, data, labels, series, showValues = true, showLegend = true } = chart

  switch (type) {
    case "bar": {
      if (!data || data.length === 0) {
        return renderEmptyChart(width, height, t, "No data provided")
      }
      const dims = getDimensions(width, height, true)
      return renderBarChart(data, dims, t, title, showValues)
    }

    case "bar-horizontal": {
      if (!data || data.length === 0) {
        return renderEmptyChart(width, height, t, "No data provided")
      }
      const dims = getDimensions(width, height, true)
      dims.margin.left = 100 // More space for labels
      dims.innerWidth = width - dims.margin.left - dims.margin.right
      return renderBarHorizontalChart(data, dims, t, title, showValues)
    }

    case "line": {
      if (!labels || !series || labels.length === 0 || series.length === 0) {
        return renderEmptyChart(width, height, t, "No series data provided")
      }
      const dims = getDimensions(width, height, true)
      return renderLineChart(labels, series, dims, t, title, showLegend)
    }

    case "pie": {
      if (!data || data.length === 0) {
        return renderEmptyChart(width, height, t, "No data provided")
      }
      return renderPieChart(data, width, height, t, title, false)
    }

    case "donut": {
      if (!data || data.length === 0) {
        return renderEmptyChart(width, height, t, "No data provided")
      }
      return renderPieChart(data, width, height, t, title, true)
    }

    default:
      return renderEmptyChart(width, height, t, `Unknown chart type: ${type}`)
  }
}

function renderEmptyChart(width: number, height: number, t: ThemeTokens, message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${t.emptyBg}"/>
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="14" fill="${t.emptyText}">${escapeXml(message)}</text>
  </svg>`
}
