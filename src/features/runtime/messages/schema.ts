import { z } from "zod"

export const RuntimeInboxQuerySchema = z
  .object({
    employeeId: z.string().optional(),
  })
  .passthrough()

export const RuntimeMessageParamsSchema = z
  .object({
    id: z.string().optional(),
  })
  .passthrough()

export const RuntimeSendMessageSchema = z
  .object({
    employeeId: z.string().optional(),
    toEmployeeId: z.string().optional(),
    toGroup: z.string().optional(),
    type: z.unknown().optional(),
    subject: z.string().optional(),
    content: z.string().optional(),
    priority: z.unknown().optional(),
    attachments: z.unknown().optional(),
    waitForResponse: z.unknown().optional(),
  })
  .passthrough()

export const RuntimeReplySchema = z
  .object({
    employeeId: z.string().optional(),
    content: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough()

export const RuntimeMessageStatusQuerySchema = z
  .object({
    employeeId: z.string().optional(),
  })
  .passthrough()

export type RuntimeInboxQueryInput = z.infer<typeof RuntimeInboxQuerySchema>
export type RuntimeMessageParamsInput = z.infer<typeof RuntimeMessageParamsSchema>
export type RuntimeSendMessageInput = z.infer<typeof RuntimeSendMessageSchema>
export type RuntimeReplyInput = z.infer<typeof RuntimeReplySchema>
export type RuntimeMessageStatusQueryInput = z.infer<
  typeof RuntimeMessageStatusQuerySchema
>
