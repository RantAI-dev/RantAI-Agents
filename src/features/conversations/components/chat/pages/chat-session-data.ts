export interface SerializedChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  replyTo?: string | null
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
  metadata?: {
    artifactIds?: string[]
    toolCalls?: Array<{
      toolCallId: string
      toolName: string
      state: string
      input?: Record<string, unknown>
      output?: unknown
      errorText?: string
    }>
    artifacts?: Array<{
      id: string
      title: string
      content: string
      artifactType: string
      metadata?: {
        artifactLanguage?: string
        versions?: Array<{
          content: string
          title: string
          timestamp: number
        }>
      }
    }>
    attachments?: Array<{
      fileName: string
      mimeType: string
      type: string
      text?: string
      pageCount?: number
      chunkCount?: number
      fileId?: string
    }>
  } | null
}

export interface SerializedChatArtifact {
  id: string
  title: string
  content: string
  artifactType: string | null
  metadata?: {
    artifactLanguage?: string
    versions?: Array<{
      content: string
      title: string
      timestamp: number
    }>
  } | null
}

export interface SerializedChatSession {
  id: string
  dbId?: string
  title: string
  assistantId: string
  createdAt: string
  messages: SerializedChatMessage[]
  artifacts?: SerializedChatArtifact[]
}

export function normalizeSerializedChatMessage(message: SerializedChatMessage) {
  return {
    ...message,
    createdAt: new Date(message.createdAt),
    replyTo: message.replyTo ?? undefined,
    editHistory: message.editHistory?.map((entry) => ({
      ...entry,
      editedAt: new Date(entry.editedAt),
    })),
  }
}

export function normalizeSerializedChatSession(session: SerializedChatSession) {
  return {
    id: session.id,
    dbId: session.dbId,
    title: session.title,
    assistantId: session.assistantId,
    createdAt: new Date(session.createdAt),
    messages: session.messages.map(normalizeSerializedChatMessage),
    artifacts: session.artifacts?.map((artifact) => ({
      ...artifact,
      artifactType: artifact.artifactType ?? "",
    })),
  }
}

export function normalizeSerializedChatSessions(sessions: SerializedChatSession[]) {
  return sessions.map((session) => normalizeSerializedChatSession(session))
}

export function serializeHydrationPayload(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
