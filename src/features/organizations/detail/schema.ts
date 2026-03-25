import { z } from "zod"

export const OrganizationDetailParamsSchema = z.object({
  id: z.string().min(1),
})

export const UpdateOrganizationSchema = z
  .object({
    name: z.string().min(1).optional(),
    logoUrl: z.string().nullable().optional(),
  })
  .strict()

export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>
