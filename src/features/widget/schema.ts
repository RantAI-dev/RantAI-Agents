import { z } from "zod"

export const WidgetConfigQuerySchema = z.object({
  key: z.string().min(1),
})

export const WidgetHandoffMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
})

export const WidgetHandoffCreateSchema = z.object({
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  productInterest: z.string().optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      })
    )
    .optional(),
})

export const WidgetHandoffPollQuerySchema = z.object({
  conversationId: z.string().min(1),
  after: z.string().optional(),
})

export type WidgetHandoffCreateInput = z.infer<typeof WidgetHandoffCreateSchema>
export type WidgetHandoffMessageInput = z.infer<typeof WidgetHandoffMessageSchema>
export type WidgetHandoffPollQueryInput = z.infer<typeof WidgetHandoffPollQuerySchema>
