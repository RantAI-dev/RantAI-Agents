import { z } from "zod"

export const KnowledgeGroupIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const KnowledgeGroupCreateSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    color: z.string().optional(),
  })
  .passthrough()

export type KnowledgeGroupCreateInput = z.infer<typeof KnowledgeGroupCreateSchema>

export const KnowledgeGroupUpdateSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    color: z.string().optional(),
  })
  .passthrough()

export type KnowledgeGroupUpdateInput = z.infer<typeof KnowledgeGroupUpdateSchema>
