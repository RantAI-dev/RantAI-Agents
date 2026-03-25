import { z } from "zod"

export const DashboardOpenApiSpecIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardOpenApiSpecCreateBodySchema = z.any()
export const DashboardOpenApiSpecResyncBodySchema = z.any()

export type DashboardOpenApiSpecCreateInput = z.infer<
  typeof DashboardOpenApiSpecCreateBodySchema
>
