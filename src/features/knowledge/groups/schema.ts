import { z } from "zod"

export const KnowledgeGroupIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const KnowledgeGroupCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
})

export type KnowledgeGroupCreateInput = z.infer<typeof KnowledgeGroupCreateSchema>

export const KnowledgeGroupUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
})

export type KnowledgeGroupUpdateInput = z.infer<typeof KnowledgeGroupUpdateSchema>
