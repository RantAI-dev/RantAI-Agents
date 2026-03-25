import {
  checkRateLimit,
  validateApiKeyFormat,
  validateDomain,
} from "@/lib/embed"
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@/lib/embed/types"
import { processChatFile, type FileProcessingResult } from "@/lib/chat/file-processor"
import { CHAT_ATTACHMENT_MIME_TYPES } from "@/lib/files/mime-types"
import { brand } from "@/lib/branding"
import {
  countWaitingWidgetConversations,
  createWidgetConversation,
  createWidgetMessages,
  createWidgetSystemMessage,
  createWidgetUserMessage,
  findConversationById,
  findConversationByIdWithAgent,
  findEnabledEmbedKeyByKey,
  findWidgetAssistantById,
  findWidgetMessages,
  touchEmbedKeyLastUsed,
} from "./repository"
import type {
  WidgetHandoffCreateInput,
  WidgetHandoffMessageInput,
} from "./schema"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES: readonly string[] = CHAT_ATTACHMENT_MIME_TYPES

export const WIDGET_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Widget-Api-Key",
}

export interface ServiceError {
  status: number
  error: string
  code: string
  domain?: string
  retryAfter?: number
  headers?: Record<string, string>
}

interface WidgetEmbedKey {
  id: string
  assistantId: string
  allowedDomains: string[]
  config: unknown
}

export interface WidgetConfigResponse {
  assistantId: string
  assistantName: string
  assistantEmoji: string
  assistantDescription: string | null
  liveChatEnabled: boolean
  config: WidgetConfig
  poweredByText: string
  poweredByUrl: string
}

export interface WidgetUploadResponse {
  success: true
  fileName: string
  fileType: string
  fileSize: number
  base64?: string
  content?: string
  result?: FileProcessingResult
  message: string
}

function toServiceError(input: ServiceError): ServiceError {
  return input
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Validates key format, existence and allowed domain.
 */
export async function validateWidgetAccess(params: {
  apiKey: string | null
  origin: string | null
  missingCode: "MISSING_KEY" | "INVALID_KEY"
  invalidFormatCode: "INVALID_KEY_FORMAT" | "INVALID_KEY"
  missingStatus?: number
}): Promise<WidgetEmbedKey | ServiceError> {
  if (!params.apiKey) {
    return toServiceError({
      status:
        params.missingStatus ??
        (params.missingCode === "MISSING_KEY" ? 400 : 401),
      error: params.missingCode === "MISSING_KEY" ? "API key is required" : "Invalid or missing API key",
      code: params.missingCode,
    })
  }

  if (!validateApiKeyFormat(params.apiKey)) {
    return toServiceError({
      status: params.invalidFormatCode === "INVALID_KEY_FORMAT" ? 400 : 401,
      error: params.invalidFormatCode === "INVALID_KEY_FORMAT" ? "Invalid API key format" : "Invalid or missing API key",
      code: params.invalidFormatCode,
    })
  }

  const embedKey = await findEnabledEmbedKeyByKey(params.apiKey)
  if (!embedKey) {
    return toServiceError({
      status: 401,
      error: "API key not found or disabled",
      code: "INVALID_KEY",
    })
  }

  const domainValidation = validateDomain(params.origin, embedKey.allowedDomains)
  if (!domainValidation.valid) {
    return toServiceError({
      status: 403,
      error: "Domain not allowed",
      code: "DOMAIN_NOT_ALLOWED",
      domain: domainValidation.domain ?? undefined,
    })
  }

  return {
    id: embedKey.id,
    assistantId: embedKey.assistantId,
    allowedDomains: embedKey.allowedDomains,
    config: embedKey.config,
  }
}

/**
 * Returns public widget config for a validated key.
 */
export async function getWidgetConfig(params: {
  apiKey: string | null
  origin: string | null
}): Promise<WidgetConfigResponse | ServiceError> {
  const access = await validateWidgetAccess({
    apiKey: params.apiKey,
    origin: params.origin,
    missingCode: "MISSING_KEY",
    invalidFormatCode: "INVALID_KEY_FORMAT",
    missingStatus: 400,
  })
  if (isServiceError(access)) return access

  const assistant = await findWidgetAssistantById(access.assistantId)
  if (!assistant) {
    return toServiceError({
      status: 404,
      error: "Assistant not found",
      code: "ASSISTANT_NOT_FOUND",
    })
  }

  const config: WidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    ...(access.config as object),
  }

  touchEmbedKeyLastUsed(access.id).catch(console.error)

  return {
    assistantId: assistant.id,
    assistantName: assistant.name,
    assistantEmoji: assistant.emoji,
    assistantDescription: assistant.description,
    liveChatEnabled: assistant.liveChatEnabled,
    config,
    poweredByText: brand.poweredByText,
    poweredByUrl: brand.companyUrl,
  }
}

/**
 * Creates a widget handoff conversation and bootstrap messages.
 */
export async function createWidgetHandoff(params: {
  apiKey: string | null
  origin: string | null
  input: WidgetHandoffCreateInput
}): Promise<
  | {
      conversation: {
        id: string
        sessionId: string
        customerName: string | null
        customerEmail: string | null
        customerPhone: string | null
        productInterest: string | null
        channel: string
        createdAt: string
        handoffAt: string | null
      }
      queuePosition: number
      lastMessagePreview: string | null
    }
  | ServiceError
> {
  const access = await validateWidgetAccess({
    apiKey: params.apiKey,
    origin: params.origin,
    missingCode: "INVALID_KEY",
    invalidFormatCode: "INVALID_KEY",
  })
  if (isServiceError(access)) return access

  const sessionId = `widget_${access.id}_${Date.now()}`
  const conversation = await createWidgetConversation({
    sessionId,
    customerName: params.input.customerName || "Widget Visitor",
    customerEmail: params.input.customerEmail,
    productInterest: params.input.productInterest,
  })

  if (params.input.chatHistory && params.input.chatHistory.length > 0) {
    await createWidgetMessages(conversation.id, params.input.chatHistory)
  }

  await createWidgetSystemMessage(conversation.id)

  const waitingCount = await countWaitingWidgetConversations()

  return {
    conversation: {
      id: conversation.id,
      sessionId: conversation.sessionId,
      customerName: conversation.customerName,
      customerEmail: conversation.customerEmail,
      customerPhone: conversation.customerPhone,
      productInterest: conversation.productInterest,
      channel: conversation.channel,
      createdAt: conversation.createdAt.toISOString(),
      handoffAt: conversation.handoffAt?.toISOString() || null,
    },
    queuePosition: waitingCount,
    lastMessagePreview:
      params.input.chatHistory && params.input.chatHistory.length > 0
        ? params.input.chatHistory[params.input.chatHistory.length - 1]?.content || null
        : null,
  }
}

/**
 * Polls handoff status and newly available agent/system messages.
 */
export async function pollWidgetHandoff(params: {
  apiKey: string | null
  origin: string | null
  conversationId: string
  after?: string
}): Promise<
  | {
      status: string
      agentName: string | null
      messages: Array<{
        id: string
        role: string
        content: string
        timestamp: string
      }>
    }
  | ServiceError
> {
  const access = await validateWidgetAccess({
    apiKey: params.apiKey,
    origin: params.origin,
    missingCode: "INVALID_KEY",
    invalidFormatCode: "INVALID_KEY",
  })
  if (isServiceError(access)) return access

  const conversation = await findConversationByIdWithAgent(params.conversationId)
  if (!conversation) {
    return toServiceError({
      status: 404,
      error: "Conversation not found",
      code: "NOT_FOUND",
    })
  }

  if (!conversation.sessionId.startsWith(`widget_${access.id}_`)) {
    return toServiceError({
      status: 404,
      error: "Conversation not found",
      code: "NOT_FOUND",
    })
  }

  const afterDate = isNonEmptyString(params.after) ? new Date(params.after) : undefined
  const messages = await findWidgetMessages({
    conversationId: params.conversationId,
    after: afterDate,
  })

  return {
    status: conversation.status,
    agentName: conversation.agent?.name || null,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role.toLowerCase(),
      content: message.content,
      timestamp: message.createdAt.toISOString(),
    })),
  }
}

/**
 * Sends one widget user message to an existing handoff conversation.
 */
export async function createWidgetHandoffMessage(params: {
  apiKey: string | null
  origin: string | null
  input: WidgetHandoffMessageInput
}): Promise<
  | {
      conversation: {
        id: string
        sessionId: string
      }
      message: {
        id: string
        role: string
        content: string
        createdAt: string
      }
    }
  | ServiceError
> {
  const access = await validateWidgetAccess({
    apiKey: params.apiKey,
    origin: params.origin,
    missingCode: "INVALID_KEY",
    invalidFormatCode: "INVALID_KEY",
  })
  if (isServiceError(access)) return access

  const conversation = await findConversationById(params.input.conversationId)
  if (!conversation) {
    return toServiceError({
      status: 404,
      error: "Conversation not found",
      code: "NOT_FOUND",
    })
  }

  if (!conversation.sessionId.startsWith(`widget_${access.id}_`)) {
    return toServiceError({
      status: 404,
      error: "Conversation not found",
      code: "NOT_FOUND",
    })
  }

  const message = await createWidgetUserMessage({
    conversationId: params.input.conversationId,
    content: params.input.content,
  })

  return {
    conversation: {
      id: conversation.id,
      sessionId: conversation.sessionId,
    },
    message: {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    },
  }
}

/**
 * Validates and processes one widget file upload.
 */
export async function uploadWidgetFile(params: {
  apiKey: string | null
  origin: string | null
  file: File | null
}): Promise<WidgetUploadResponse | ServiceError> {
  const access = await validateWidgetAccess({
    apiKey: params.apiKey,
    origin: params.origin,
    missingCode: "MISSING_KEY",
    invalidFormatCode: "INVALID_KEY_FORMAT",
    missingStatus: 401,
  })
  if (isServiceError(access)) return access

  const rateLimit = checkRateLimit(access.id)
  if (!rateLimit.allowed) {
    return toServiceError({
      status: 429,
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: rateLimit.resetIn,
    })
  }

  if (!params.file) {
    return toServiceError({
      status: 400,
      error: "No file provided",
      code: "MISSING_FILE",
    })
  }

  if (!ALLOWED_TYPES.includes(params.file.type)) {
    return toServiceError({
      status: 400,
      error: `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}`,
      code: "INVALID_FILE_TYPE",
    })
  }

  if (params.file.size > MAX_FILE_SIZE) {
    return toServiceError({
      status: 400,
      error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      code: "FILE_TOO_LARGE",
    })
  }

  const arrayBuffer = await params.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let result: FileProcessingResult | undefined
  try {
    result = await processChatFile(buffer, params.file.type, params.file.name)
  } catch (error) {
    console.error("[Widget Upload Service] File processing error:", error)
  }

  const extractedContent =
    params.file.type === "text/plain" || params.file.type === "text/markdown"
      ? buffer.toString("utf-8")
      : ""
  const base64Data = params.file.type.startsWith("image/")
    ? buffer.toString("base64")
    : undefined

  return {
    success: true,
    fileName: params.file.name,
    fileType: params.file.type,
    fileSize: params.file.size,
    base64: base64Data,
    content: extractedContent || undefined,
    result: result || undefined,
    message: params.file.type.startsWith("image/")
      ? "Image uploaded. Include in your next message."
      : params.file.type === "application/pdf"
        ? "PDF uploaded. Content will be processed with your next message."
        : "File uploaded successfully.",
  }
}

export function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown; code?: unknown }
  return (
    typeof candidate.status === "number" &&
    typeof candidate.error === "string" &&
    typeof candidate.code === "string"
  )
}
