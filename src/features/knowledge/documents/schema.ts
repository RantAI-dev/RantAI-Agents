import { z } from "zod"

export const KnowledgeDocumentListQuerySchema = z
  .object({
    groupId: z.string().optional(),
  })
  .passthrough()

export const KnowledgeDocumentIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const KnowledgeDocumentCreateSchema = z
  .object({
    title: z.string().optional(),
    content: z.string().optional(),
    categories: z.unknown().optional(),
    subcategory: z.string().optional(),
    groupIds: z.unknown().optional(),
  })
  .passthrough()

export const KnowledgeDocumentUpdateSchema = z
  .object({
    title: z.string().optional(),
    categories: z.unknown().optional(),
    subcategory: z.union([z.string(), z.null()]).optional(),
    groupIds: z.unknown().optional(),
  })
  .passthrough()

export const KnowledgeDocumentIntelligenceParamsSchema = z.object({
  id: z.string().min(1),
})

export type KnowledgeDocumentCreateInput = z.infer<typeof KnowledgeDocumentCreateSchema> & {
  kind: "json" | "file"
  /** Legacy toggle — accepted for API back-compat but ignored; the per-type
   *  pipeline policy decides what runs (see lib/ingest/pipeline-policy). */
  useEnhanced: boolean
  useCombined: boolean
  /** Legacy alias for figureMode "force". */
  forceOCR?: boolean
  /** PDF-only: auto (default) | force (layout parser even with a text layer) | skip. */
  figureMode?: string
  documentType?: string
  file?: File
}

export type KnowledgeDocumentUpdateInput = z.infer<typeof KnowledgeDocumentUpdateSchema>
