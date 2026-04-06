import { z } from "zod"

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
      sources: z
        .array(
          z.object({
            title: z.string(),
            content: z.string(),
            similarity: z.number().optional(),
          })
        )
        .optional(),
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
  sources: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
        similarity: z.number().optional(),
      })
    )
    .optional(),
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
