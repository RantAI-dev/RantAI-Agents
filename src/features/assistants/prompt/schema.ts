import { z } from "zod"

export const GenerateAssistantPromptBodySchema = z.object({
  description: z.string().trim().min(5),
})

export type GenerateAssistantPromptBodyInput = z.infer<
  typeof GenerateAssistantPromptBodySchema
>
