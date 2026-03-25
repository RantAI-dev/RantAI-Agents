import { z } from "zod"

export const ADMIN_FEATURES = ["AGENT"] as const

export const AdminFeatureSchema = z.enum(ADMIN_FEATURES)

export const UpdateAdminFeatureSchema = z.object({
  feature: AdminFeatureSchema,
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export type UpdateAdminFeatureInput = z.infer<typeof UpdateAdminFeatureSchema>
