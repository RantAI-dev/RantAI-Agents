import { z } from "zod"

export const RuntimeApprovalSchema = z
  .object({
    requestType: z.unknown().optional(),
    title: z.unknown().optional(),
    description: z.unknown().optional(),
    content: z.unknown().optional(),
    options: z.unknown().optional(),
    workflowStepId: z.string().optional(),
    expiresInMs: z.number().optional(),
    timeoutAction: z.string().optional(),
  })
  .passthrough()

export type RuntimeApprovalInput = z.infer<typeof RuntimeApprovalSchema>
