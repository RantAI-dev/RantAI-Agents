import { z } from "zod"

export const UpdateAdminProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
})

export type UpdateAdminProfileInput = z.infer<typeof UpdateAdminProfileSchema>
