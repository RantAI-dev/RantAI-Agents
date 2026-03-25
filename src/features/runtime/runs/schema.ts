import { z } from "zod"

export const RuntimeRunParamsSchema = z
  .object({
    runId: z.string().optional(),
  })
  .passthrough()

export const RuntimeRunStatusSchema = z
  .object({
    status: z.string().optional(),
    error: z.string().optional(),
    executionTimeMs: z.number().optional(),
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
  })
  .passthrough()

export const RuntimeRunOutputSchema = z.unknown()

export type RuntimeRunParamsInput = z.infer<typeof RuntimeRunParamsSchema>
export type RuntimeRunStatusInput = z.infer<typeof RuntimeRunStatusSchema>
export type RuntimeRunOutputInput = z.infer<typeof RuntimeRunOutputSchema>
