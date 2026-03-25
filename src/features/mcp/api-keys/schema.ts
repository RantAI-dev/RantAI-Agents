import { z } from "zod"

export const CreateDashboardMcpApiKeySchema = z.object({
  name: z.string().min(1),
  exposedTools: z.array(z.string()).optional(),
})

export const UpdateDashboardMcpApiKeySchema = z.object({
  name: z.string().optional(),
  exposedTools: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

export type CreateDashboardMcpApiKeyInput = z.infer<
  typeof CreateDashboardMcpApiKeySchema
>
export type UpdateDashboardMcpApiKeyInput = z.infer<
  typeof UpdateDashboardMcpApiKeySchema
>
