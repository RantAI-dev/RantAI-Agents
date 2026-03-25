import { z } from "zod"

export const DashboardDigitalEmployeeMessageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().optional(),
})

export const DashboardDigitalEmployeeIntegrationCreateSchema = z.object({
  integrationId: z.string().min(1),
  credentials: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const DashboardDigitalEmployeeIntegrationUpdateSchema = z.object({
  credentials: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const DashboardDigitalEmployeeSkillInstallSchema = z.object({
  slug: z.string().optional(),
  source: z.string().optional(),
})

export const DashboardDigitalEmployeeSkillUpdateSchema = z.object({
  enabled: z.boolean().optional(),
})

export const DashboardDigitalEmployeeSkillSearchQuerySchema = z.object({
  q: z.string().optional(),
})

export const DashboardDigitalEmployeeTriggerCreateSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  filterRules: z.array(z.unknown()).optional(),
})

export const DashboardDigitalEmployeeTriggerUpdateSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  filterRules: z.array(z.unknown()).optional(),
})

export type DashboardDigitalEmployeeMessageListInput = z.infer<
  typeof DashboardDigitalEmployeeMessageListQuerySchema
>
export type DashboardDigitalEmployeeIntegrationCreateInput = z.infer<
  typeof DashboardDigitalEmployeeIntegrationCreateSchema
>
export type DashboardDigitalEmployeeIntegrationUpdateInput = z.infer<
  typeof DashboardDigitalEmployeeIntegrationUpdateSchema
>
export type DashboardDigitalEmployeeSkillInstallInput = z.infer<
  typeof DashboardDigitalEmployeeSkillInstallSchema
>
export type DashboardDigitalEmployeeSkillUpdateInput = z.infer<
  typeof DashboardDigitalEmployeeSkillUpdateSchema
>
export type DashboardDigitalEmployeeSkillSearchInput = z.infer<
  typeof DashboardDigitalEmployeeSkillSearchQuerySchema
>
export type DashboardDigitalEmployeeTriggerCreateInput = z.infer<
  typeof DashboardDigitalEmployeeTriggerCreateSchema
>
export type DashboardDigitalEmployeeTriggerUpdateInput = z.infer<
  typeof DashboardDigitalEmployeeTriggerUpdateSchema
>
