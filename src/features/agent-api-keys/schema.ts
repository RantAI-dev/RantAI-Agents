import { z } from "zod"

export const CreateAgentApiKeySchema = z.object({
  name: z.string().min(1),
  assistantId: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  ipWhitelist: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
})

export const UpdateAgentApiKeySchema = z.object({
  name: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  ipWhitelist: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

export type CreateAgentApiKeyInput = z.infer<typeof CreateAgentApiKeySchema>
export type UpdateAgentApiKeyInput = z.infer<typeof UpdateAgentApiKeySchema>
