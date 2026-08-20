import { z } from "zod"

/**
 * A retrieval source persisted on an assistant message. Mirrors the RagSource
 * the chat stream emits so figures/pages/citations survive a reload. `content`
 * and `similarity` are legacy/optional; the rest drive the Sources & Figures
 * cards and numbered `[n]` citations. Keep OPTIONAL + additive — z.object
 * strips unknown keys, so any field the UI reads MUST be listed here.
 */
export const PersistedSourceSchema = z.object({
  title: z.string(),
  section: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  assetKey: z.string().nullable().optional(),
  page: z.number().nullable().optional(),
  chunkType: z.string().nullable().optional(),
  content: z.string().optional(),
  similarity: z.number().optional(),
  /** Reading-order position of the chunk, and — for a figure — the position of
   *  the chunk it follows. Together they let the client place a figure beside
   *  the prose it belongs to, which is the only route available for the
   *  majority of figures that carry no printed caption to match on. */
  chunkIndex: z.number().nullable().optional(),
  anchorChunkIndex: z.number().nullable().optional(),
})

export const DashboardChatSessionIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardChatSessionArtifactParamsSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
})

export const DashboardChatSessionCreateBodySchema = z.object({
  assistantId: z.string().min(1),
  title: z.string().optional(),
})

export const DashboardChatSessionUpdateBodySchema = z.object({
  title: z.string().min(1).optional(),
})

export const DashboardChatSessionMessagesBodySchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().optional(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      replyTo: z.string().optional(),
      editHistory: z
        .array(
          z.object({
            content: z.string(),
            assistantResponse: z.string().optional(),
            editedAt: z.string(),
          })
        )
        .optional(),
      sources: z.array(PersistedSourceSchema).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
})

export const DashboardChatSessionMessageUpdateBodySchema = z.object({
  messageId: z.string().min(1),
  content: z.string().optional(),
  editHistory: z
    .array(
      z.object({
        content: z.string(),
        assistantResponse: z.string().optional(),
        editedAt: z.string(),
      })
    )
    .optional(),
  sources: z.array(PersistedSourceSchema).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const DashboardChatSessionMessageDeleteBodySchema = z.object({
  messageIds: z.array(z.string().min(1)),
})

export const DashboardChatSessionArtifactBodySchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
})

export type DashboardChatSessionCreateInput = z.infer<
  typeof DashboardChatSessionCreateBodySchema
>
export type DashboardChatSessionUpdateInput = z.infer<
  typeof DashboardChatSessionUpdateBodySchema
>
export type DashboardChatSessionMessagesInput = z.infer<
  typeof DashboardChatSessionMessagesBodySchema
>
export type DashboardChatSessionMessageUpdateInput = z.infer<
  typeof DashboardChatSessionMessageUpdateBodySchema
>
export type DashboardChatSessionMessageDeleteInput = z.infer<
  typeof DashboardChatSessionMessageDeleteBodySchema
>
export type DashboardChatSessionArtifactInput = z.infer<
  typeof DashboardChatSessionArtifactBodySchema
>
