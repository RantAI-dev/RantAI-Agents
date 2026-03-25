import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listAssistantsForUser, type AssistantListItem } from "@/src/features/assistants/core/service"
import { listDashboardChatSessions } from "@/src/features/conversations/sessions/service"
import type { DbAssistant } from "@/hooks/use-assistants"
import {
  loadAssistantEditorHydrationData,
  loadChatToolbarHydrationData,
} from "./chat-hydration-server"
import type {
  AssistantEditorHydrationData,
  ChatToolbarHydrationData,
} from "./chat-hydration-data"
import type { SerializedChatSession } from "./chat-session-data"

export interface ChatPageHydration {
  initialAssistants?: DbAssistant[]
  initialSessions?: SerializedChatSession[]
  initialToolbarData?: ChatToolbarHydrationData | null
  assistantEditorHydrationData?: AssistantEditorHydrationData | null
}

function mapAssistantsForClient(assistants: AssistantListItem[]): DbAssistant[] {
  return assistants.map((assistant) => ({
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    emoji: assistant.emoji,
    systemPrompt: assistant.systemPrompt,
    model: assistant.model,
    useKnowledgeBase: assistant.useKnowledgeBase,
    knowledgeBaseGroupIds: assistant.knowledgeBaseGroupIds,
    memoryConfig: assistant.memoryConfig as object | null,
    modelConfig: assistant.modelConfig as object | null,
    chatConfig: assistant.chatConfig as object | null,
    guardRails: assistant.guardRails as object | null,
    avatarS3Key: assistant.avatarS3Key,
    openingMessage: assistant.openingMessage,
    openingQuestions: assistant.openingQuestions,
    isSystemDefault: assistant.isSystemDefault,
    isBuiltIn: assistant.isBuiltIn,
    tags: assistant.tags,
    liveChatEnabled: assistant.liveChatEnabled,
    createdAt: assistant.createdAt,
    toolCount: assistant.toolCount,
  }))
}

function mapSessionsForHydration(
  sessions: Awaited<ReturnType<typeof listDashboardChatSessions>>
): SerializedChatSession[] {
  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    assistantId: session.assistantId,
    createdAt: session.createdAt,
    messages: [],
  }))
}

export async function loadChatPageHydration(): Promise<ChatPageHydration> {
  const session = await auth()
  if (!session?.user?.id) {
    return {}
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  let initialAssistants: DbAssistant[] | undefined
  let initialSessions: SerializedChatSession[] | undefined

  try {
    const assistants = await listAssistantsForUser({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
    })
    initialAssistants = mapAssistantsForClient(assistants)
  } catch (error) {
    console.error("[ChatPage] Failed to load assistants:", error)
  }

  try {
    const sessions = await listDashboardChatSessions({
      userId: session.user.id,
    })
    initialSessions = mapSessionsForHydration(sessions)
  } catch (error) {
    console.error("[ChatPage] Failed to load chat sessions:", error)
  }

  const defaultAssistant = initialAssistants?.find((assistant) => assistant.isSystemDefault) ?? initialAssistants?.[0]

  let initialToolbarData: ChatToolbarHydrationData | null | undefined
  let assistantEditorHydrationData: AssistantEditorHydrationData | null | undefined

  if (defaultAssistant?.id) {
    try {
      initialToolbarData = await loadChatToolbarHydrationData({
        assistantId: defaultAssistant.id,
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      })
    } catch (error) {
      console.error("[ChatPage] Failed to load toolbar hydration data:", error)
    }

    try {
      assistantEditorHydrationData = await loadAssistantEditorHydrationData({
        assistantId: defaultAssistant.id,
        organizationId: orgContext?.organizationId ?? null,
      })
    } catch (error) {
      console.error("[ChatPage] Failed to load assistant editor hydration data:", error)
    }
  }

  return {
    initialAssistants,
    initialSessions,
    initialToolbarData,
    assistantEditorHydrationData,
  }
}
