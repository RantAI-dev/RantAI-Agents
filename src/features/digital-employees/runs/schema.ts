import { z } from "zod"

export const DigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DigitalEmployeeRunIdParamsSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
})

export const DigitalEmployeeRunsQuerySchema = z
  .object({
    limit: z.string().optional(),
  })
  .passthrough()

export const TriggerDigitalEmployeeRunSchema = z
  .object({
    trigger: z.string().optional(),
    workflowId: z.string().optional(),
    input: z.unknown().optional(),
  })
  .passthrough()
