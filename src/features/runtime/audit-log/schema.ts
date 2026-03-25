import { z } from "zod"

export const RuntimeAuditLogSchema = z
  .object({
    action: z.string().optional(),
    resource: z.string().optional(),
    detail: z.unknown().optional(),
    riskLevel: z.string().optional(),
  })
  .passthrough()

export type RuntimeAuditLogInput = z.infer<typeof RuntimeAuditLogSchema>
