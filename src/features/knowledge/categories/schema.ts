import { z } from "zod"

export const KnowledgeCategoryIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const KnowledgeCategoryCreateSchema = z
  .object({
    label: z.string().optional(),
    color: z.string().optional(),
  })
  .passthrough()

export type KnowledgeCategoryCreateInput = z.infer<typeof KnowledgeCategoryCreateSchema>

export const KnowledgeCategoryUpdateSchema = z
  .object({
    label: z.string().optional(),
    color: z.string().optional(),
  })
  .passthrough()

export type KnowledgeCategoryUpdateInput = z.infer<typeof KnowledgeCategoryUpdateSchema>
