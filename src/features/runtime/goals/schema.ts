import { z } from "zod"

export const RuntimeGoalUpdateSchema = z
  .object({
    goalId: z.string().min(1),
    increment: z.unknown().optional(),
    setValue: z.unknown().optional(),
  })
  .passthrough()
