/**
 * Zod mirror of `ChartData` / `ChartDataPoint` / `ChartSeries` from `./types`.
 * Authoritative shape lives in `types.ts`; this file is asserted-compatible
 * via `expectTypeOf` in the test file.
 */

import { z } from "zod"

export const ChartDataPointSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
  color: z.string().optional(),
})

export const ChartSeriesSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.number()),
  color: z.string().optional(),
})

export const ChartDataSchema = z.object({
  type: z.enum(["bar", "bar-horizontal", "line", "pie", "donut"]),
  title: z.string().optional(),
  data: z.array(ChartDataPointSchema).optional(),
  labels: z.array(z.string()).optional(),
  series: z.array(ChartSeriesSchema).optional(),
  showValues: z.boolean().optional(),
  showLegend: z.boolean().optional(),
})

export type ChartDataParsed = z.infer<typeof ChartDataSchema>
