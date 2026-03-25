import { z } from "zod"

export const ToolIdSchema = z.object({
  id: z.string().min(1),
})

export const CreateToolSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().min(1),
    parameters: z.unknown().optional(),
    executionConfig: z.unknown().nullable().optional(),
  })
  .strict()

export const UpdateToolSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    parameters: z.unknown().optional(),
    executionConfig: z.unknown().nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

export type CreateToolInput = z.infer<typeof CreateToolSchema>
export type UpdateToolInput = z.infer<typeof UpdateToolSchema>
