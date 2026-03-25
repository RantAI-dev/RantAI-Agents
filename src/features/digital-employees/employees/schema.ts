import { z } from "zod"

const ApprovalStatusSchema = z.enum([
  "PENDING",
  "DELIVERED",
  "APPROVED",
  "REJECTED",
  "EDITED",
  "EXPIRED",
  "CANCELLED",
])

export const DashboardDigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardDigitalEmployeeListQuerySchema = z
  .object({
    organizationId: z.string().optional().nullable(),
  })
  .passthrough()

export const DashboardDigitalEmployeeCreateBodySchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
    assistantId: z.string().min(1),
    autonomyLevel: z.string().optional(),
    groupId: z.string().optional().nullable(),
  })
  .passthrough()

export const DashboardDigitalEmployeeUpdateBodySchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
    assistantId: z.string().optional(),
    autonomyLevel: z.string().optional(),
    deploymentConfig: z.unknown().optional(),
    resourceLimits: z.unknown().optional(),
    gatewayConfig: z.unknown().optional(),
    supervisorId: z.string().optional(),
    status: z.string().optional(),
    sandboxMode: z.boolean().optional(),
    groupId: z.string().optional().nullable(),
  })
  .passthrough()

export const DashboardDigitalEmployeePurgeBodySchema = z
  .object({
    confirmName: z.string().min(1),
  })
  .passthrough()

export const DashboardDigitalEmployeeActivityQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).optional(),
    before: z.string().optional().nullable(),
  })
  .passthrough()

export const DashboardDigitalEmployeeApprovalsQuerySchema = z
  .object({
    status: ApprovalStatusSchema.optional().nullable(),
  })
  .passthrough()

export const DashboardDigitalEmployeeMemoryQuerySchema = z
  .object({
    type: z.string().optional().nullable(),
  })
  .passthrough()

export type DashboardDigitalEmployeeCreateInput = z.infer<
  typeof DashboardDigitalEmployeeCreateBodySchema
>
export type DashboardDigitalEmployeeUpdateInput = z.infer<
  typeof DashboardDigitalEmployeeUpdateBodySchema
>
export type DashboardDigitalEmployeePurgeInput = z.infer<
  typeof DashboardDigitalEmployeePurgeBodySchema
>
export type DashboardDigitalEmployeeActivityQueryInput = z.infer<
  typeof DashboardDigitalEmployeeActivityQuerySchema
>
export type DashboardDigitalEmployeeApprovalsQueryInput = z.infer<
  typeof DashboardDigitalEmployeeApprovalsQuerySchema
>
export type DashboardDigitalEmployeeMemoryQueryInput = z.infer<
  typeof DashboardDigitalEmployeeMemoryQuerySchema
>
