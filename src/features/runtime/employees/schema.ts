import { z } from "zod"

export const RuntimeEmployeeListQuerySchema = z
  .object({
    employeeId: z.string().min(1).optional(),
  })
  .passthrough()

export const RuntimeEmployeeIdParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough()

export const RuntimeEmployeeSyncSchema = z
  .object({
    changes: z.any().optional(),
  })
  .passthrough()

export type RuntimeEmployeeListQueryInput = z.infer<typeof RuntimeEmployeeListQuerySchema>
export type RuntimeEmployeeIdParamsInput = z.infer<typeof RuntimeEmployeeIdParamsSchema>
export type RuntimeEmployeeSyncInput = z.infer<typeof RuntimeEmployeeSyncSchema>
