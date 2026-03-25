import { z } from "zod"

export const DigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DigitalEmployeeToolParamsSchema = z.object({
  id: z.string().min(1),
  toolId: z.string().min(1),
})

export const CustomToolCreateBodySchema = z
  .object({
    name: z.any(),
    description: z.any().optional(),
    parameters: z.any().optional(),
    code: z.any(),
    language: z.any().optional(),
  })
  .passthrough()

export const CustomToolUpdateBodySchema = z
  .object({
    name: z.any().optional(),
    description: z.any().optional(),
    parameters: z.any().optional(),
    code: z.any().optional(),
    language: z.any().optional(),
    enabled: z.any().optional(),
    approved: z.any().optional(),
  })
  .passthrough()

export type CustomToolCreateInput = z.infer<typeof CustomToolCreateBodySchema>
export type CustomToolUpdateInput = z.infer<typeof CustomToolUpdateBodySchema>
