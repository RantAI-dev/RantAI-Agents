import { z } from "zod"

const CredentialTypeSchema = z.enum(["api_key", "oauth2", "basic_auth", "bearer"])

export const CreateCredentialSchema = z.object({
  name: z.string().min(1),
  type: CredentialTypeSchema,
  data: z.record(z.unknown()),
})

export const UpdateCredentialSchema = z.object({
  name: z.string().optional(),
  type: CredentialTypeSchema.optional(),
  data: z.record(z.unknown()).optional(),
})

export type CreateCredentialInput = z.infer<typeof CreateCredentialSchema>
export type UpdateCredentialInput = z.infer<typeof UpdateCredentialSchema>
export type CredentialType = z.infer<typeof CredentialTypeSchema>
