import { z } from "zod"

export const HandoffMessageBodySchema = z
  .object({
    conversationId: z.any(),
    content: z.any(),
  })
  .passthrough()

export const HandoffRequestBodySchema = z
  .object({
    assistantId: z.any().optional(),
    chatHistory: z.any().optional(),
  })
  .passthrough()

export const HandoffStatusQuerySchema = z
  .object({
    conversationId: z.any().optional(),
    after: z.any().optional(),
  })
  .passthrough()

export type HandoffMessageInput = z.infer<typeof HandoffMessageBodySchema>
export type HandoffRequestInput = z.infer<typeof HandoffRequestBodySchema>
