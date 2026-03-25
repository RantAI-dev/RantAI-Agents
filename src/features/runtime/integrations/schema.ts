import { z } from "zod"

export const RuntimeIntegrationCredentialsSchema = z
  .object({
    integrationId: z.string().min(1).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough()

export const RuntimeStoreIntegrationCredentialsSchema = z
  .object({
    employeeId: z.string().min(1).optional(),
    integrationId: z.string().min(1).optional(),
    credentials: z.unknown().optional(),
    expiresIn: z.number().optional(),
    metadata: z.unknown().optional(),
  })
  .passthrough()

export const RuntimeTestIntegrationSchema = z
  .object({
    integrationId: z.string().min(1).optional(),
  })
  .passthrough()

export type RuntimeIntegrationCredentialsInput = z.infer<
  typeof RuntimeIntegrationCredentialsSchema
>
export type RuntimeStoreIntegrationCredentialsInput = z.infer<
  typeof RuntimeStoreIntegrationCredentialsSchema
>
export type RuntimeTestIntegrationInput = z.infer<typeof RuntimeTestIntegrationSchema>
