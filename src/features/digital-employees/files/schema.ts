import { z } from "zod"

export const DigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DigitalEmployeeFileParamsSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
})

export const EmployeeFilesSyncBodySchema = z
  .object({
    files: z.any(),
  })
  .passthrough()

export const EmployeeFileUpdateBodySchema = z
  .object({
    content: z.any().optional(),
  })
  .passthrough()

export type EmployeeFilesSyncInput = z.infer<typeof EmployeeFilesSyncBodySchema>
export type EmployeeFileUpdateInput = z.infer<typeof EmployeeFileUpdateBodySchema>
