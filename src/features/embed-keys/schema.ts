import { z } from "zod"

const WidgetConfigSchema = z.record(z.unknown())

export const CreateDashboardEmbedKeySchema = z.object({
  name: z.string().min(1),
  assistantId: z.string().min(1),
  allowedDomains: z.array(z.string()).optional(),
  config: WidgetConfigSchema.optional(),
})

export const UpdateDashboardEmbedKeySchema = z.object({
  name: z.string().optional(),
  allowedDomains: z.array(z.string()).optional(),
  config: WidgetConfigSchema.optional(),
  enabled: z.boolean().optional(),
})

export type CreateDashboardEmbedKeyInput = z.infer<
  typeof CreateDashboardEmbedKeySchema
>
export type UpdateDashboardEmbedKeyInput = z.infer<
  typeof UpdateDashboardEmbedKeySchema
>
