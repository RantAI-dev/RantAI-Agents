import { z } from "zod"

export const EmployeeWebhookTokenParamsSchema = z.object({
  token: z.string().min(1),
})

export const EmployeeIdParamsSchema = z.object({
  employeeId: z.string().min(1),
})

export const EmployeeWhatsAppVerifyQuerySchema = z.object({
  mode: z.string().optional(),
  token: z.string().optional(),
  challenge: z.string().optional(),
})

export const SendWhatsAppBodySchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1),
})

export const GlobalWhatsAppVerifyQuerySchema = z.object({
  mode: z.string().optional(),
  token: z.string().optional(),
  challenge: z.string().optional(),
})

export const TwilioWebhookFormSchema = z.object({
  MessageSid: z.string().optional(),
  AccountSid: z.string().optional(),
  From: z.string().optional(),
  To: z.string().optional(),
  Body: z.string().optional(),
  NumMedia: z.string().optional(),
  ProfileName: z.string().optional(),
  WaId: z.string().optional(),
})

export type EmployeeWebhookTokenParamsInput = z.infer<typeof EmployeeWebhookTokenParamsSchema>
export type EmployeeIdParamsInput = z.infer<typeof EmployeeIdParamsSchema>
export type EmployeeWhatsAppVerifyQueryInput = z.infer<typeof EmployeeWhatsAppVerifyQuerySchema>
export type SendWhatsAppBodyInput = z.infer<typeof SendWhatsAppBodySchema>
export type GlobalWhatsAppVerifyQueryInput = z.infer<typeof GlobalWhatsAppVerifyQuerySchema>
export type TwilioWebhookFormInput = z.infer<typeof TwilioWebhookFormSchema>
