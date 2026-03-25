import { z } from "zod"

export const DigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DigitalEmployeeGoalIdParamsSchema = z.object({
  id: z.string().min(1),
  goalId: z.string().min(1),
})

export const CreateDigitalEmployeeGoalSchema = z
  .object({
    name: z.string().optional(),
    type: z.string().optional(),
    target: z.unknown().optional(),
    unit: z.string().optional(),
    period: z.string().optional(),
    source: z.string().optional(),
    autoTrackConfig: z.unknown().optional(),
  })
  .passthrough()

export const UpdateDigitalEmployeeGoalSchema = z
  .object({
    name: z.string().optional(),
    target: z.unknown().optional(),
    unit: z.string().optional(),
    period: z.string().optional(),
    currentValue: z.unknown().optional(),
    status: z.string().optional(),
  })
  .passthrough()
