import { z } from "zod"

export const RuntimeSkillSearchQuerySchema = z
  .object({
    q: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough()

export const RuntimeSkillInstallSchema = z
  .object({
    source: z.string().optional(),
    skillId: z.string().optional(),
    id: z.string().optional(),
    slug: z.string().optional(),
  })
  .passthrough()

export type RuntimeSkillSearchQueryInput = z.infer<typeof RuntimeSkillSearchQuerySchema>
export type RuntimeSkillInstallInput = z.infer<typeof RuntimeSkillInstallSchema>
