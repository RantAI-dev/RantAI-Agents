import { z } from "zod"

export const DashboardStatisticsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
})

export type DashboardStatisticsQueryInput = z.infer<
  typeof DashboardStatisticsQuerySchema
>
