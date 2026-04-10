import { Prisma } from "@prisma/client"
import { canEdit, canManage } from "@/lib/organization"
import { DEFAULT_MODEL_ID, isValidModel } from "@/lib/models"
import {
  createAssistant,
  deleteAssistantById,
  findAssistantById,
  listAssistantsByScope,
  updateAssistantById,
} from "./repository"
import type { CreateAssistantInput, UpdateAssistantInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface AssistantAccessContext {
  organizationId: string | null
  role: string | null
}

export interface AssistantListItem {
  id: string
  name: string
  description: string | null
  emoji: string
  systemPrompt: string
  model: string
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  isSystemDefault: boolean
  isBuiltIn: boolean
  organizationId: string | null
  createdBy: string | null
  updatedBy: string | null
  liveChatEnabled: boolean
  avatarS3Key: string | null
  modelConfig: unknown | null
  openingMessage: string | null
  openingQuestions: string[]
  guardRails: unknown | null
  chatConfig: unknown | null
  memoryConfig: unknown | null
  tags: string[]
  createdAt: string
  updatedAt: string
  toolCount: number
}

function toNullableJsonUpdate(
  value: unknown | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

function toNullableJsonCreate(
  value: unknown | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

/**
 * Loads one assistant while enforcing org scoping rules.
 */
export async function getAssistantForUser(params: {
  id: string
  context: AssistantAccessContext
}): Promise<Record<string, unknown> | ServiceError> {
  const assistant = await findAssistantById(params.id)
  if (!assistant) {
    return { status: 404, error: "Assistant not found" }
  }

  if (!assistant.isBuiltIn && assistant.organizationId) {
    if (!params.context.organizationId || assistant.organizationId !== params.context.organizationId) {
      return { status: 404, error: "Assistant not found" }
    }
  }

  return assistant as unknown as Record<string, unknown>
}

/**
 * Lists assistants visible to the current organization context.
 */
export async function listAssistantsForUser(
  context: AssistantAccessContext
): Promise<AssistantListItem[]> {
  const assistants = await listAssistantsByScope(context.organizationId)

  return assistants.map((assistant) => ({
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    emoji: assistant.emoji,
    systemPrompt: assistant.systemPrompt,
    model: assistant.model,
    useKnowledgeBase: assistant.useKnowledgeBase,
    knowledgeBaseGroupIds: assistant.knowledgeBaseGroupIds,
    isSystemDefault: assistant.isSystemDefault,
    isBuiltIn: assistant.isBuiltIn,
    organizationId: assistant.organizationId,
    createdBy: assistant.createdBy,
    updatedBy: assistant.updatedBy,
    liveChatEnabled: assistant.liveChatEnabled,
    avatarS3Key: assistant.avatarS3Key,
    modelConfig: assistant.modelConfig,
    openingMessage: assistant.openingMessage,
    openingQuestions: assistant.openingQuestions,
    guardRails: assistant.guardRails,
    chatConfig: assistant.chatConfig,
    memoryConfig: assistant.memoryConfig,
    tags: assistant.tags,
    createdAt: assistant.createdAt.toISOString(),
    updatedAt: assistant.updatedAt.toISOString(),
    toolCount: assistant._count.tools,
  }))
}

/**
 * Creates a new assistant in the current organization scope.
 */
export async function createAssistantForUser(params: {
  userId: string
  input: CreateAssistantInput
  organizationId: string | null
  role: string | null
}): Promise<Record<string, unknown> | ServiceError> {
  if (params.organizationId && (!params.role || !canEdit(params.role))) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const selectedModel = params.input.model ?? DEFAULT_MODEL_ID
  if (!isValidModel(selectedModel)) {
    return { status: 400, error: "Invalid model selected" }
  }

  const createData: Prisma.AssistantUncheckedCreateInput = {
    name: params.input.name,
    description: params.input.description ?? null,
    emoji: params.input.emoji ?? "🤖",
    systemPrompt: params.input.systemPrompt,
    model: selectedModel,
    useKnowledgeBase: params.input.useKnowledgeBase ?? false,
    knowledgeBaseGroupIds: params.input.knowledgeBaseGroupIds ?? [],
    isSystemDefault: false,
    isBuiltIn: false,
    organizationId: params.organizationId,
    createdBy: params.userId,
  }

  const memoryConfig = toNullableJsonCreate(params.input.memoryConfig)
  if (memoryConfig !== undefined) createData.memoryConfig = memoryConfig
  if (params.input.liveChatEnabled !== undefined) {
    createData.liveChatEnabled = params.input.liveChatEnabled
  }
  const modelConfig = toNullableJsonCreate(params.input.modelConfig)
  if (modelConfig !== undefined) createData.modelConfig = modelConfig
  if (params.input.openingMessage !== undefined) {
    createData.openingMessage = params.input.openingMessage
  }
  if (params.input.openingQuestions !== undefined) {
    createData.openingQuestions = params.input.openingQuestions
  }
  const chatConfig = toNullableJsonCreate(params.input.chatConfig)
  if (chatConfig !== undefined) createData.chatConfig = chatConfig
  const guardRails = toNullableJsonCreate(params.input.guardRails)
  if (guardRails !== undefined) createData.guardRails = guardRails
  if (params.input.avatarS3Key !== undefined) {
    createData.avatarS3Key = params.input.avatarS3Key
  }
  if (params.input.tags !== undefined) createData.tags = params.input.tags

  const assistant = await createAssistant(createData)

  return assistant as unknown as Record<string, unknown>
}

/**
 * Updates a single assistant while preserving built-in constraints.
 */
export async function updateAssistantForUser(params: {
  id: string
  userId: string
  input: UpdateAssistantInput
  context: AssistantAccessContext
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = await findAssistantById(params.id)
  if (!existing) {
    return { status: 404, error: "Assistant not found" }
  }

  if (params.input.model !== undefined && !isValidModel(params.input.model)) {
    return { status: 400, error: "Invalid model selected" }
  }

  if (existing.isBuiltIn) {
    const allowedData: Prisma.AssistantUpdateInput = {
      updatedBy: params.userId,
    }
    if (params.input.description !== undefined) allowedData.description = params.input.description
    if (params.input.emoji !== undefined) allowedData.emoji = params.input.emoji
    if (params.input.systemPrompt !== undefined) allowedData.systemPrompt = params.input.systemPrompt
    if (params.input.model !== undefined) allowedData.model = params.input.model
    if (params.input.memoryConfig !== undefined) {
      allowedData.memoryConfig = toNullableJsonUpdate(params.input.memoryConfig)
    }
    if (params.input.liveChatEnabled !== undefined) {
      allowedData.liveChatEnabled = params.input.liveChatEnabled
    }
    if (params.input.modelConfig !== undefined) {
      allowedData.modelConfig = toNullableJsonUpdate(params.input.modelConfig)
    }
    if (params.input.openingMessage !== undefined) allowedData.openingMessage = params.input.openingMessage
    if (params.input.openingQuestions !== undefined) allowedData.openingQuestions = params.input.openingQuestions
    if (params.input.chatConfig !== undefined) {
      allowedData.chatConfig = toNullableJsonUpdate(params.input.chatConfig)
    }
    if (params.input.guardRails !== undefined) {
      allowedData.guardRails = toNullableJsonUpdate(params.input.guardRails)
    }
    if (params.input.avatarS3Key !== undefined) allowedData.avatarS3Key = params.input.avatarS3Key
    if (params.input.tags !== undefined) allowedData.tags = params.input.tags

    const updated = await updateAssistantById(params.id, allowedData)
    return updated as unknown as Record<string, unknown>
  }

  if (existing.organizationId) {
    if (!params.context.organizationId || existing.organizationId !== params.context.organizationId) {
      return { status: 404, error: "Assistant not found" }
    }
    if (!params.context.role || !canEdit(params.context.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  const updateData: Prisma.AssistantUpdateInput = {
    updatedBy: params.userId,
  }
  if (params.input.name !== undefined) updateData.name = params.input.name
  if (params.input.description !== undefined) updateData.description = params.input.description
  if (params.input.emoji !== undefined) updateData.emoji = params.input.emoji
  if (params.input.systemPrompt !== undefined) updateData.systemPrompt = params.input.systemPrompt
  if (params.input.model !== undefined) updateData.model = params.input.model
  if (params.input.useKnowledgeBase !== undefined) updateData.useKnowledgeBase = params.input.useKnowledgeBase
  if (params.input.knowledgeBaseGroupIds !== undefined) {
    updateData.knowledgeBaseGroupIds = params.input.knowledgeBaseGroupIds
  }
  if (params.input.memoryConfig !== undefined) {
    updateData.memoryConfig = toNullableJsonUpdate(params.input.memoryConfig)
  }
  if (params.input.liveChatEnabled !== undefined) updateData.liveChatEnabled = params.input.liveChatEnabled
  if (params.input.modelConfig !== undefined) {
    updateData.modelConfig = toNullableJsonUpdate(params.input.modelConfig)
  }
  if (params.input.openingMessage !== undefined) updateData.openingMessage = params.input.openingMessage
  if (params.input.openingQuestions !== undefined) updateData.openingQuestions = params.input.openingQuestions
  if (params.input.chatConfig !== undefined) {
    updateData.chatConfig = toNullableJsonUpdate(params.input.chatConfig)
  }
  if (params.input.guardRails !== undefined) {
    updateData.guardRails = toNullableJsonUpdate(params.input.guardRails)
  }
  if (params.input.avatarS3Key !== undefined) updateData.avatarS3Key = params.input.avatarS3Key
  if (params.input.tags !== undefined) updateData.tags = params.input.tags

  const updated = await updateAssistantById(params.id, updateData)
  return updated as unknown as Record<string, unknown>
}

/**
 * Deletes a non-built-in assistant after org and role checks.
 */
export async function deleteAssistantForUser(params: {
  id: string
  context: AssistantAccessContext
}): Promise<{ success: true } | ServiceError> {
  const existing = await findAssistantById(params.id)
  if (!existing) {
    return { status: 404, error: "Assistant not found" }
  }

  if (existing.isBuiltIn) {
    return { status: 403, error: "Cannot delete built-in assistants" }
  }

  if (existing.organizationId) {
    if (!params.context.organizationId || existing.organizationId !== params.context.organizationId) {
      return { status: 404, error: "Assistant not found" }
    }
    if (!params.context.role || !canManage(params.context.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  await deleteAssistantById(params.id)
  return { success: true }
}
