import { z } from "zod"

export const WidgetChatBodySchema = z.object({
  messages: z.array(z.unknown()),
  visitorId: z.string().optional(),
  customerId: z.string().optional(),
  fileContext: z.string().optional(),
  fileDocumentIds: z.array(z.string()).optional(),
  threadId: z.string().optional(),
})

export type WidgetChatBodyInput = z.infer<typeof WidgetChatBodySchema>
