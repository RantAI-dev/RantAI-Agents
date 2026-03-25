import { z } from "zod"

export const CreateDashboardSkillSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  content: z.string().min(1),
  source: z.string().optional(),
  sourceUrl: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})

export const UpdateDashboardSkillSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

export const ImportDashboardSkillSchema = z
  .object({
    slug: z.string().optional(),
    rawContent: z.string().optional(),
  })
  .refine((value) => Boolean(value.slug || value.rawContent), {
    message: "Either slug or rawContent is required",
  })

export const DashboardSkillIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardSkillReadinessQuerySchema = z.object({
  assistantId: z.string().min(1),
})

export type CreateDashboardSkillInput = z.infer<typeof CreateDashboardSkillSchema>
export type UpdateDashboardSkillInput = z.infer<typeof UpdateDashboardSkillSchema>
export type ImportDashboardSkillInput = z.infer<typeof ImportDashboardSkillSchema>
