import { z } from "zod"

export const AssistantIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const UpdateAssistantSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    emoji: z.string().min(1).optional(),
    systemPrompt: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    useKnowledgeBase: z.boolean().optional(),
    knowledgeBaseGroupIds: z.array(z.string()).optional(),
    memoryConfig: z.unknown().nullable().optional(),
    liveChatEnabled: z.boolean().optional(),
    modelConfig: z.unknown().nullable().optional(),
    openingMessage: z.string().nullable().optional(),
    openingQuestions: z.array(z.string()).optional(),
    chatConfig: z.unknown().nullable().optional(),
    guardRails: z.unknown().nullable().optional(),
    avatarS3Key: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()

export const CreateAssistantSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    emoji: z.string().min(1).optional(),
    systemPrompt: z.string().min(1),
    model: z.string().min(1).optional(),
    useKnowledgeBase: z.boolean().optional(),
    knowledgeBaseGroupIds: z.array(z.string()).optional(),
    memoryConfig: z.unknown().nullable().optional(),
    liveChatEnabled: z.boolean().optional(),
    modelConfig: z.unknown().nullable().optional(),
    openingMessage: z.string().nullable().optional(),
    openingQuestions: z.array(z.string()).optional(),
    chatConfig: z.unknown().nullable().optional(),
    guardRails: z.unknown().nullable().optional(),
    avatarS3Key: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()

export type UpdateAssistantInput = z.infer<typeof UpdateAssistantSchema>
export type CreateAssistantInput = z.infer<typeof CreateAssistantSchema>
