import { z } from "zod"

export const DashboardTemplateIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardTemplateCreateBodySchema = z
  .object({
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    category: z.unknown().optional(),
    templateData: z.unknown().optional(),
    isPublic: z.unknown().optional(),
  })
  .passthrough()

export const DashboardTemplateUpdateBodySchema = z
  .object({
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    category: z.unknown().optional(),
    templateData: z.unknown().optional(),
    isPublic: z.unknown().optional(),
  })
  .passthrough()

export type DashboardTemplateCreateInput = z.infer<
  typeof DashboardTemplateCreateBodySchema
>
export type DashboardTemplateUpdateInput = z.infer<
  typeof DashboardTemplateUpdateBodySchema
>
