import { z } from "zod"

export const WorkflowPublicIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const WorkflowPublicWebhookParamsSchema = z.object({
  path: z.string().min(1),
})

export const WorkflowPublicRunBodySchema = z
  .object({
    input: z.unknown().optional(),
  })
  .passthrough()

export const WorkflowPublicDiscoverQuerySchema = z
  .object({
    name: z.string().optional(),
    mode: z.enum(["STANDARD", "CHATFLOW"]).optional(),
    apiEnabled: z.enum(["true", "false"]).optional(),
  })
  .passthrough()
