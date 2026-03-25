import { z } from "zod"

export const RuntimeOnboardingReportSchema = z
  .object({
    employeeId: z.string().min(1).optional(),
    step: z.string().optional(),
    status: z.string().optional(),
    details: z.unknown().optional(),
  })
  .passthrough()

export type RuntimeOnboardingReportInput = z.infer<typeof RuntimeOnboardingReportSchema>
