import { z } from "zod"

const ChatMessagePartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough()

const ChatMessageSchema = z
  .object({
    id: z.string(),
    role: z.string(),
    content: z.string().optional(),
    parts: z.array(ChatMessagePartSchema).optional(),
  })
  .passthrough()

export const ChatRequestBodySchema = z
  .object({
    messages: z.array(ChatMessageSchema),
    fileContext: z.string().optional(),
    fileDocumentIds: z.array(z.string()).optional(),
    threadId: z.string().optional(),
    sessionId: z.string().optional(),
    assistantId: z.string().optional(),
    systemPrompt: z.string().optional(),
    useKnowledgeBase: z.boolean().optional(),
    knowledgeBaseGroupIds: z.array(z.string()).optional(),
    enableSkills: z.boolean().optional(),
    enabledSkillIds: z.array(z.string()).optional(),
    enableTools: z.boolean().optional(),
    enabledToolNames: z.array(z.string()).optional(),
    enableWebSearch: z.boolean().optional(),
    enableCodeInterpreter: z.boolean().optional(),
    canvasMode: z.string().optional(),
    organizationId: z.string().optional(),
    targetArtifactId: z.string().optional(),
  })
  .passthrough()

export const ChatRequestHeadersSchema = z.object({
  assistantId: z.string().nullable(),
  systemPromptB64: z.string().nullable(),
  useKnowledgeBase: z.string().nullable(),
})

export const ChatUploadFormSchema = z.object({
  file: z.custom<File>((value) => value instanceof File, {
    message: "No file provided",
  }),
  sessionId: z.string().nullable().optional(),
})

export const ChatAttachmentFileParamsSchema = z.object({
  fileId: z.string().regex(/^[a-f0-9-]+\.\w+$/i, "Invalid file ID"),
})

export const ConversationIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const CreateConversationBodySchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
})

export type ChatRequestInput = z.infer<typeof ChatRequestBodySchema>
