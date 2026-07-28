import { z } from "zod"

export const WidgetChatBodySchema = z.object({
  messages: z.array(z.unknown()),
  visitorId: z.string().optional(),
  customerId: z.string().optional(),
  fileContext: z.string().optional(),
  fileDocumentIds: z.array(z.string()).optional(),
  // Per-request KB selection: subset of the assistant's bound KB groups to
  // scope retrieval to. Values not bound to the assistant are dropped
  // server-side; empty/omitted → all of the assistant's KB groups.
  knowledgeBaseGroupIds: z.array(z.string()).optional(),
  threadId: z.string().optional(),
})

export type WidgetChatBodyInput = z.infer<typeof WidgetChatBodySchema>
