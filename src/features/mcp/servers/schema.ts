import { z } from "zod"

export const DashboardMcpServerIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardMcpServerCreateBodySchema = z
  .object({
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    transport: z.unknown().optional(),
    url: z.unknown().optional(),
    env: z.unknown().optional(),
    headers: z.unknown().optional(),
    envKeys: z.unknown().optional(),
    docsUrl: z.unknown().optional(),
    isBuiltIn: z.unknown().optional(),
  })
  .passthrough()

export const DashboardMcpServerUpdateBodySchema = z
  .object({
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    transport: z.unknown().optional(),
    url: z.unknown().optional(),
    env: z.unknown().optional(),
    headers: z.unknown().optional(),
    enabled: z.unknown().optional(),
    configured: z.unknown().optional(),
  })
  .passthrough()

export type DashboardMcpServerCreateInput = z.infer<
  typeof DashboardMcpServerCreateBodySchema
>
export type DashboardMcpServerUpdateInput = z.infer<
  typeof DashboardMcpServerUpdateBodySchema
>
