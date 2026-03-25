import { z } from "zod"

export const DashboardMemoryIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardMemoryListQuerySchema = z
  .object({
    type: z.any().optional(),
  })
  .passthrough()

export const DashboardMemoryBulkDeleteBodySchema = z.any()

export type DashboardMemoryBulkDeleteInput = z.infer<
  typeof DashboardMemoryBulkDeleteBodySchema
>
