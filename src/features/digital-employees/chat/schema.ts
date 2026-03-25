import { z } from "zod"

export const DigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const ChatQuerySchema = z
  .object({
    messageId: z.any().optional(),
    after: z.any().optional(),
  })
  .passthrough()

export const ChatMessageBodySchema = z
  .object({
    message: z.any(),
  })
  .passthrough()

export type ChatMessageInput = z.infer<typeof ChatMessageBodySchema>
