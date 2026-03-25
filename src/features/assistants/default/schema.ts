import { z } from "zod"

export const AssistantIdParamsSchema = z.object({
  id: z.string().min(1),
})

