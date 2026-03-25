import { z } from "zod"

export const CreateOrganizationSchema = z
  .object({
    name: z.string().min(2),
    slug: z.string().optional(),
  })
  .strict()

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>
