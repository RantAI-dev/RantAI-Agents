import { z } from "zod"

export const OrganizationLogoParamsSchema = z.object({
  id: z.string().min(1),
})

export const UploadOrganizationLogoFormSchema = z.object({
  file: z.custom<File>((value) => value instanceof File, {
    message: "No file provided",
  }),
})
