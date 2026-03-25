import { z } from "zod"

export const RuntimeToolExecuteSchema = z
  .object({
    toolName: z.string().optional(),
    input: z.unknown().optional(),
  })
  .passthrough()

export type RuntimeToolExecuteInput = z.infer<typeof RuntimeToolExecuteSchema>
