import { z } from "zod"

export const DashboardGroupIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardGroupCreateBodySchema = z
  .object({
    name: z.any(),
    description: z.any().optional(),
  })
  .passthrough()

export const DashboardGroupUpdateBodySchema = z
  .object({
    name: z.any().optional(),
    description: z.any().optional(),
    isImplicit: z.any().optional(),
  })
  .passthrough()

export const DashboardGroupMembersBodySchema = z
  .object({
    employeeIds: z.any(),
  })
  .passthrough()

export type DashboardGroupCreateInput = z.infer<typeof DashboardGroupCreateBodySchema>
export type DashboardGroupUpdateInput = z.infer<typeof DashboardGroupUpdateBodySchema>
export type DashboardGroupMembersInput = z.infer<typeof DashboardGroupMembersBodySchema>
