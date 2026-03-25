import { z } from "zod"

export const ADMIN_CHANNELS = ["PORTAL", "SALESFORCE", "WHATSAPP", "EMAIL"] as const

export const AdminChannelSchema = z.enum(ADMIN_CHANNELS)

export const UpdateAdminChannelSchema = z.object({
  channel: AdminChannelSchema,
  enabled: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export type UpdateAdminChannelInput = z.infer<typeof UpdateAdminChannelSchema>
