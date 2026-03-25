import { z } from "zod"

export const DashboardAuditQuerySchema = z
  .object({
    employeeId: z.string().optional(),
    action: z.string().optional(),
    riskLevel: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.string().optional(),
  })
  .passthrough()

export type DashboardAuditQueryInput = z.infer<typeof DashboardAuditQuerySchema>
