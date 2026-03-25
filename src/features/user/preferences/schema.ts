import { z } from "zod"

export const UpdateUserPreferencesSchema = z
  .object({
    defaultAssistantId: z.string().nullable().optional(),
    sidebarConfig: z.unknown().nullable().optional(),
  })
  .strict()

export type UpdateUserPreferencesInput = z.infer<typeof UpdateUserPreferencesSchema>
