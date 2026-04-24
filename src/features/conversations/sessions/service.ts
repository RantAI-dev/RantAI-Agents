import { deleteFile, deleteFiles, uploadFile } from "@/lib/s3"
import { deleteChunksByDocumentId } from "@/lib/rag"
import {
  validateArtifactContent,
  formatValidationError,
} from "@/lib/tools/builtin/_validate-artifact"
import {
  createDashboardMessages,
  createDashboardSession,
  deleteArtifactsBySessionId,
  deleteDashboardArtifactById,
  deleteDashboardMessagesBySession,
  deleteDashboardSessionById,
  findArtifactsBySessionId,
  findDashboardArtifactByIdAndSession,
  findDashboardMessageByIdAndSession,
  findDashboardSessionBasicByIdAndUser,
  findDashboardSessionByIdAndUser,
  findDashboardSessionsByUser,
  updateDashboardArtifactById,
  updateDashboardMessageById,
  updateDashboardSessionTitle,
} from "./repository"
import type {
  DashboardChatSessionCreateInput,
  DashboardChatSessionMessagesInput,
  DashboardChatSessionMessageUpdateInput,
  DashboardChatSessionMessageDeleteInput,
  DashboardChatSessionArtifactInput,
  DashboardChatSessionUpdateInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardChatSessionSummary {
  id: string
  title: string
  assistantId: string
  createdAt: string
  updatedAt?: string
  messageCount: number
  lastMessage: string | null
}

export interface DashboardChatSessionMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  replyTo: string | null
  editHistory?: Array<{
    content: string
    assistantResponse?: string
    editedAt: string
  }>
  sources?: Array<{
    title: string
    content: string
    similarity?: number
  }>
  metadata: Record<string, unknown> | null
}

export interface DashboardChatSessionArtifact {
  id: string
  title: string
  content: string
  artifactType: string | null
  metadata: Record<string, unknown> | null
}

export interface DashboardChatSessionDetail {
  id: string
  title: string
  assistantId: string
  createdAt: string
  messages: DashboardChatSessionMessage[]
  artifacts: DashboardChatSessionArtifact[]
}

type DashboardChatSessionMessageRow = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
  replyTo: string | null
  editHistory: DashboardChatSessionMessage["editHistory"] | null
  sources: DashboardChatSessionMessage["sources"] | null
  metadata: Record<string, unknown> | null
}

type DashboardChatSessionArtifactRow = {
  id: string
  title: string
  content: string
  artifactType: string | null
  metadata: Record<string, unknown> | null
}

type DashboardChatSessionDetailRow = {
  id: string
  title: string
  assistantId: string
  createdAt: Date
  messages: DashboardChatSessionMessageRow[]
  artifacts: DashboardChatSessionArtifactRow[]
}

function formatSessionSummary(session: {
  id: string
  title: string
  assistantId: string
  createdAt: Date
  updatedAt: Date
  messages: Array<{ content: string; createdAt: Date }>
  _count: { messages: number }
}): DashboardChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    assistantId: session.assistantId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messageCount: session._count.messages,
    lastMessage: session.messages[0]?.content?.slice(0, 100) || null,
  }
}

function formatMessage(message: {
  id: string
  role: string
  content: string
  createdAt: Date
  replyTo: string | null
  editHistory: unknown
  sources: unknown
  metadata: Record<string, unknown> | null
}): DashboardChatSessionMessage {
  return {
    id: message.id,
    role: message.role as "user" | "assistant",
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    replyTo: message.replyTo,
    editHistory:
      (message.editHistory as DashboardChatSessionMessage["editHistory"] | null) ?? undefined,
    sources: (message.sources as DashboardChatSessionMessage["sources"] | null) ?? undefined,
    metadata: message.metadata,
  }
}

function formatArtifact(artifact: {
  id: string
  title: string
  content: string
  artifactType: string | null
  metadata: Record<string, unknown> | null
}): DashboardChatSessionArtifact {
  return {
    id: artifact.id,
    title: artifact.title,
    content: artifact.content,
    artifactType: artifact.artifactType,
    metadata: artifact.metadata,
  }
}

/**
 * Lists dashboard chat sessions for the current user.
 */
export async function listDashboardChatSessions(params: {
  userId: string
}): Promise<DashboardChatSessionSummary[]> {
  const sessions = await findDashboardSessionsByUser(params.userId)
  return sessions.map(formatSessionSummary)
}

/**
 * Creates a new dashboard chat session.
 */
export async function createDashboardChatSession(params: {
  userId: string
  input: DashboardChatSessionCreateInput
}): Promise<DashboardChatSessionSummary | ServiceError> {
  const { assistantId, title } = params.input as { assistantId?: unknown; title?: unknown }

  if (!assistantId) {
    return { status: 400, error: "assistantId is required" }
  }

  const chatSession = await createDashboardSession({
    userId: params.userId,
    assistantId: assistantId as string,
    title: (title as string) || "New Chat",
  })

  return {
    id: chatSession.id,
    title: chatSession.title,
    assistantId: chatSession.assistantId,
    createdAt: chatSession.createdAt.toISOString(),
    messageCount: 0,
    lastMessage: null,
  }
}

/**
 * Loads one dashboard chat session with messages and artifacts.
 */
export async function getDashboardChatSession(params: {
  userId: string
  sessionId: string
}): Promise<DashboardChatSessionDetail | ServiceError> {
  const chatSession = (await findDashboardSessionByIdAndUser(
    params.sessionId,
    params.userId
  )) as DashboardChatSessionDetailRow | null
  if (!chatSession) {
    return { status: 404, error: "Session not found" }
  }

  return {
    id: chatSession.id,
    title: chatSession.title,
    assistantId: chatSession.assistantId,
    createdAt: chatSession.createdAt.toISOString(),
    messages: chatSession.messages.map((message) => formatMessage(message)),
    artifacts: chatSession.artifacts.map((artifact) => formatArtifact(artifact)),
  }
}

/**
 * Updates the chat session title.
 */
export async function updateDashboardChatSession(params: {
  userId: string
  sessionId: string
  input: DashboardChatSessionUpdateInput
}): Promise<{ id: string; title: string; assistantId: string; createdAt: string } | ServiceError> {
  const existing = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!existing) {
    return { status: 404, error: "Session not found" }
  }

  const { title } = params.input as { title?: unknown }
  const updated = await updateDashboardSessionTitle(params.sessionId, (title as string) || existing.title)

  return {
    id: updated.id,
    title: updated.title,
    assistantId: updated.assistantId,
    createdAt: updated.createdAt.toISOString(),
  }
}

/**
 * Deletes a dashboard chat session.
 */
export async function deleteDashboardChatSession(params: {
  userId: string
  sessionId: string
}): Promise<{ success: true } | ServiceError> {
  const existing = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!existing) {
    return { status: 404, error: "Session not found" }
  }

  // Cleanup artifact S3 files and RAG chunks before deleting session
  const artifacts = await findArtifactsBySessionId(params.sessionId)
  if (artifacts.length > 0) {
    // Delete S3 files (non-fatal)
    const s3Keys = artifacts.map((a) => a.s3Key).filter(Boolean) as string[]
    if (s3Keys.length > 0) {
      await deleteFiles(s3Keys).catch((err) =>
        console.error("[deleteDashboardChatSession] S3 cleanup error:", err)
      )
    }
    // Delete RAG chunks (non-fatal)
    await Promise.allSettled(
      artifacts.map((a) => deleteChunksByDocumentId(a.id))
    )
    // Delete document records
    await deleteArtifactsBySessionId(params.sessionId)
  }

  await deleteDashboardSessionById(params.sessionId)
  return { success: true }
}

/**
 * Adds one or more messages to a dashboard chat session.
 */
export async function addDashboardChatSessionMessages(params: {
  userId: string
  sessionId: string
  input: DashboardChatSessionMessagesInput
}): Promise<{ messages: DashboardChatSessionMessage[] } | ServiceError> {
  const { messages } = params.input as { messages?: unknown }
  if (!messages || !Array.isArray(messages)) {
    return { status: 400, error: "messages array is required" }
  }

  const chatSession = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!chatSession) {
    return { status: 404, error: "Session not found" }
  }

  const createdMessages = (await createDashboardMessages(
    messages.map((message: {
      id?: string
      role: "user" | "assistant"
      content: string
      replyTo?: string
      editHistory?: Array<{ content: string; assistantResponse?: string; editedAt: string }>
      sources?: Array<{ title: string; content: string; similarity?: number }>
      metadata?: Record<string, unknown>
    }) => ({
      id: message.id,
      sessionId: params.sessionId,
      role: message.role,
      content: message.content,
      replyTo: message.replyTo,
      editHistory: message.editHistory,
      sources: message.sources,
      metadata: message.metadata,
    }))
  )) as DashboardChatSessionMessageRow[]

  return {
    messages: createdMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      replyTo: message.replyTo,
      editHistory: message.editHistory ?? undefined,
      sources: message.sources ?? undefined,
      metadata: message.metadata,
    })),
  }
}

/**
 * Updates a dashboard chat message.
 */
export async function updateDashboardChatSessionMessage(params: {
  userId: string
  sessionId: string
  input: DashboardChatSessionMessageUpdateInput
}): Promise<DashboardChatSessionMessage | ServiceError> {
  const { messageId, content, editHistory, sources, metadata } = params.input as {
    messageId?: unknown
    content?: unknown
    editHistory?: unknown
    sources?: unknown
    metadata?: unknown
  }

  if (!messageId) {
    return { status: 400, error: "messageId is required" }
  }

  const chatSession = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!chatSession) {
    return { status: 404, error: "Session not found" }
  }

  const existingMessage = await findDashboardMessageByIdAndSession(messageId as string, params.sessionId)
  if (!existingMessage) {
    return { status: 404, error: "Message not found" }
  }

  const updated = await updateDashboardMessageById(messageId as string, {
    ...(content !== undefined && { content: content as string }),
    ...(editHistory !== undefined && { editHistory: editHistory as DashboardChatSessionMessage["editHistory"] }),
    ...(sources !== undefined && { sources: sources as DashboardChatSessionMessage["sources"] }),
    ...(metadata !== undefined && {
      metadata: metadata as Record<string, unknown>,
    }),
  }) as DashboardChatSessionMessageRow

  return {
    id: updated.id,
    role: updated.role,
    content: updated.content,
    createdAt: updated.createdAt.toISOString(),
    replyTo: updated.replyTo,
    editHistory: updated.editHistory ?? undefined,
    sources: updated.sources ?? undefined,
    metadata: updated.metadata,
  }
}

/**
 * Deletes messages from a dashboard chat session.
 */
export async function deleteDashboardChatSessionMessages(params: {
  userId: string
  sessionId: string
  input: DashboardChatSessionMessageDeleteInput
}): Promise<{ success: true } | ServiceError> {
  const { messageIds } = params.input as { messageIds?: unknown }
  if (!messageIds || !Array.isArray(messageIds)) {
    return { status: 400, error: "messageIds array is required" }
  }

  const chatSession = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!chatSession) {
    return { status: 404, error: "Session not found" }
  }

  await deleteDashboardMessagesBySession(params.sessionId, messageIds as string[])
  return { success: true }
}

/**
 * Updates a dashboard artifact and records the prior version in metadata history.
 */
/** Cap on inline-fallback content size when S3 archival fails. Mirrors the
 *  same protection in the LLM tool path (`update-artifact.ts`) so manual
 *  edits and tool-driven updates can't bloat Postgres rows.
 */
const MAX_INLINE_FALLBACK_BYTES = 32 * 1024
/** Version history cap, mirrors the LLM tool path. */
const MAX_VERSION_HISTORY = 20

export async function updateDashboardChatSessionArtifact(params: {
  userId: string
  sessionId: string
  artifactId: string
  input: DashboardChatSessionArtifactInput
}): Promise<DashboardChatSessionArtifact | ServiceError> {
  const { content, title } = params.input as { content?: unknown; title?: unknown }
  if (!content) {
    return { status: 400, error: "content is required" }
  }

  // Session ownership check — users can only mutate artifacts inside chat
  // sessions they own. The lookup returns null when the session belongs to
  // a different user, blocking cross-tenant writes via the manual edit path.
  const chatSession = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!chatSession) {
    return { status: 404, error: "Session not found" }
  }

  const existing = await findDashboardArtifactByIdAndSession(params.artifactId, params.sessionId)
  if (!existing) {
    return { status: 404, error: "Artifact not found" }
  }

  // Run the same structural validator the LLM tool path uses, so manual
  // edits get the same protection (HTML structure, React imports, SVG
  // sanitation, …). Validation failures are returned as 422 with the
  // formatted error message + raw error list so the panel can display the
  // exact issues inline in edit mode instead of silently saving garbage.
  if (existing.artifactType) {
    const validation = await validateArtifactContent(
      existing.artifactType,
      String(content),
    )
    if (!validation.ok) {
      return {
        status: 422,
        error: formatValidationError(existing.artifactType, validation),
      }
    }
  }

  const meta = (existing.metadata as Record<string, unknown>) || {}
  const versions = (meta.versions as Array<unknown>) || []
  const evictedVersionCount =
    typeof meta.evictedVersionCount === "number" ? meta.evictedVersionCount : 0
  const versionNum = versions.length + 1

  // Archive old version to a versioned S3 key
  let versionS3Key: string | undefined
  if (existing.s3Key) {
    versionS3Key = `${existing.s3Key}.v${versionNum}`
    try {
      await uploadFile(
        versionS3Key,
        Buffer.from(existing.content, "utf-8"),
        existing.mimeType || "text/plain"
      )
    } catch {
      versionS3Key = undefined
    }
  }

  // When S3 archival fails, fall back to inlining the previous content into
  // metadata — but only when it's small. For large artifacts we drop to a
  // summary-only record so the row doesn't balloon over many edits.
  const previousBytes = Buffer.byteLength(existing.content, "utf-8")
  const inlineFallback =
    !versionS3Key && previousBytes <= MAX_INLINE_FALLBACK_BYTES
      ? { content: existing.content }
      : !versionS3Key
        ? { archiveFailed: true as const }
        : null

  versions.push({
    title: existing.title,
    timestamp: Date.now(),
    contentLength: previousBytes,
    ...(versionS3Key ? { s3Key: versionS3Key } : {}),
    ...(inlineFallback ?? {}),
  })

  // Track FIFO evictions in metadata so the UI can show "+N earlier
  // versions evicted" instead of silently dropping history.
  let newlyEvicted = 0
  if (versions.length > MAX_VERSION_HISTORY) {
    newlyEvicted = versions.length - MAX_VERSION_HISTORY
    versions.splice(0, newlyEvicted)
  }
  const totalEvicted = evictedVersionCount + newlyEvicted

  if (existing.s3Key) {
    await uploadFile(
      existing.s3Key,
      Buffer.from(String(content), "utf-8"),
      existing.mimeType || "text/plain"
    )
  }

  const updated = (await updateDashboardArtifactById(params.artifactId, {
    content: String(content),
    title: (title as string) || existing.title,
    fileSize: Buffer.byteLength(String(content), "utf-8"),
    metadata: {
      ...meta,
      versions,
      ...(totalEvicted > 0 ? { evictedVersionCount: totalEvicted } : {}),
    },
  })) as DashboardChatSessionArtifactRow

  return {
    id: updated.id,
    title: updated.title,
    content: updated.content,
    artifactType: updated.artifactType,
    metadata: updated.metadata,
  }
}

export async function getDashboardChatSessionArtifact(params: {
  userId: string
  sessionId: string
  artifactId: string
}): Promise<DashboardChatSessionArtifact & { artifactType: string } | ServiceError> {
  const chatSession = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!chatSession) {
    return { status: 404, error: "Session not found" }
  }

  const artifact = await findDashboardArtifactByIdAndSession(params.artifactId, params.sessionId)
  if (!artifact) {
    return { status: 404, error: "Artifact not found" }
  }

  return {
    id: artifact.id,
    title: artifact.title,
    content: artifact.content,
    artifactType: artifact.artifactType ?? "",
    metadata: (artifact.metadata as Record<string, unknown> | null) ?? null,
  }
}

/**
 * Deletes a dashboard artifact and attempts to remove its stored file.
 */
export async function deleteDashboardChatSessionArtifact(params: {
  userId: string
  sessionId: string
  artifactId: string
}): Promise<{ success: true } | ServiceError> {
  const chatSession = await findDashboardSessionBasicByIdAndUser(params.sessionId, params.userId)
  if (!chatSession) {
    return { status: 404, error: "Session not found" }
  }

  const existing = await findDashboardArtifactByIdAndSession(params.artifactId, params.sessionId)
  if (!existing) {
    return { status: 404, error: "Artifact not found" }
  }

  if (existing.s3Key) {
    try {
      await deleteFile(existing.s3Key)
    } catch {
      // S3 delete failure is non-fatal.
    }
  }

  await deleteDashboardArtifactById(params.artifactId)
  return { success: true }
}
