import { z } from "zod"

export const KnowledgeGroupIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const KnowledgeGroupCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  /** Nest this KB inside another. Omit or null for a top-level KB. */
  parentId: z.string().min(1).nullable().optional(),
})

export type KnowledgeGroupCreateInput = z.infer<typeof KnowledgeGroupCreateSchema>

export const KnowledgeGroupUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  /**
   * Move this KB under another, or to the top level with an explicit null.
   * Absent means "leave where it is" — which is why this is `.optional()` on a
   * nullable field rather than defaulting to null, since defaulting would
   * silently un-nest a KB on every rename.
   */
  parentId: z.string().min(1).nullable().optional(),
})

export type KnowledgeGroupUpdateInput = z.infer<typeof KnowledgeGroupUpdateSchema>
