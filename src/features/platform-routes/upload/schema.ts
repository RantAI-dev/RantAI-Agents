import { z } from "zod"

export const UploadTypeSchema = z.enum(["document", "logo", "avatar", "attachment"])

export const UploadFormFieldsSchema = z.object({
  type: UploadTypeSchema,
  targetId: z.string().optional(),
})

export const PresignedUploadBodySchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.coerce.number().positive(),
  type: UploadTypeSchema,
  targetId: z.string().optional(),
})

export type UploadType = z.infer<typeof UploadTypeSchema>
export type PresignedUploadBody = z.infer<typeof PresignedUploadBodySchema>
