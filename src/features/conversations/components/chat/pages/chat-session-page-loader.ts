import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  listAssistantsForUser,
  type AssistantListItem,
} from "@/features/assistants/core/service"
import {
  listAssistantSkills,
  listAssistantTools,
} from "@/features/assistants/bindings/service"
import { listKnowledgeGroupsForDashboard } from "@/features/knowledge/groups/service"
import {
  getDashboardChatSession,
  listDashboardChatSessions,
  type DashboardChatSessionDetail,
} from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import type { DbAssistant } from "@/hooks/use-assistants"
import {
  loadAssistantEditorHydrationData,
} from "./chat-hydration-server"
import type {
  AssistantEditorHydrationData,
  AssistantSkillInfo,
  AssistantToolInfo,
  KBGroup,
} from "./chat-hydration-data"
import type { SerializedChatSession } from "./chat-session-data"

export interface ChatSessionPageHydration {
  initialAssistants?: DbAssistant[]
  initialSessions?: SerializedChatSession[]
  initialAssistantTools?: AssistantToolInfo[]
  initialAssistantSkills?: AssistantSkillInfo[]
  initialKnowledgeBaseGroups?: KBGroup[]
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

function mapSummaryToHydration(
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

function mergeDetailIntoHydration(
  sessions: SerializedChatSession[],
  detail: DashboardChatSessionDetail
): SerializedChatSession[] {
  const detailSession: SerializedChatSession = {
    id: detail.id,
    title: detail.title,
    assistantId: detail.assistantId,
    createdAt: detail.createdAt,
    messages: detail.messages.map((message) => ({
      ...message,
      replyTo: message.replyTo ?? undefined,
    })),
    artifacts: detail.artifacts.map((artifact) => ({
      ...artifact,
    })),
  }

  const index = sessions.findIndex((session) => session.id === detailSession.id)
  if (index >= 0) {
    const next = [...sessions]
    next[index] = detailSession
    return next
  }

  return [...sessions, detailSession]
}

function mapToolsForClient(
  tools: Awaited<ReturnType<typeof listAssistantTools>>
): AssistantToolInfo[] {
  if (!Array.isArray(tools)) return []
  return tools
    .filter((tool) => tool.enabledForAssistant !== false && tool.userSelectable !== false)
    .map((tool) => ({
      name: tool.name as string,
      displayName: tool.displayName as string,
      description: tool.description as string,
      category: tool.category as string,
      icon: (tool.icon as string | null | undefined) ?? null,
    }))
}

function mapSkillsForClient(
  skills: Awaited<ReturnType<typeof listAssistantSkills>>
): AssistantSkillInfo[] {
  if (!Array.isArray(skills)) return []
  return skills
    .filter((skill) => skill.enabled !== false)
    .map((skill) => ({
      id: skill.id as string,
      displayName: skill.displayName as string,
      description: skill.description as string,
      icon: (skill.icon as string | null | undefined) ?? null,
    }))
}

function mapGroupsForClient(
  groups: Awaited<ReturnType<typeof listKnowledgeGroupsForDashboard>>
): KBGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    color: group.color,
    documentCount: group.documentCount,
  }))
}

function extractAssistantId(
  sessions: SerializedChatSession[] | undefined,
  currentSessionId: string
): string | null {
  const session = sessions?.find((item) => item.id === currentSessionId)
  return session?.assistantId ?? null
}

export async function loadChatSessionPageHydration(
  sessionId: string
): Promise<ChatSessionPageHydration> {
  const session = await auth()
  if (!session?.user?.id) {
    return {}
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  let initialAssistants: ChatSessionPageHydration["initialAssistants"]
  let initialSessions: SerializedChatSession[] | undefined

  try {
    const assistants = await listAssistantsForUser({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
    })
    initialAssistants = mapAssistantsForClient(assistants)
  } catch (error) {
    console.error("[ChatSessionPage] Failed to load assistants:", error)
  }

  try {
    const sessions = await listDashboardChatSessions({
      userId: session.user.id,
    })
    initialSessions = mapSummaryToHydration(sessions)
  } catch (error) {
    console.error("[ChatSessionPage] Failed to load chat sessions:", error)
  }

  let sessionDetail: DashboardChatSessionDetail | undefined
  try {
    const detail = await getDashboardChatSession({
      userId: session.user.id,
      sessionId,
    })
    if (!isHttpServiceError(detail)) {
      sessionDetail = detail
      initialSessions = mergeDetailIntoHydration(initialSessions ?? [], detail)
    }
  } catch (error) {
    console.error("[ChatSessionPage] Failed to load chat session detail:", error)
  }

  let initialAssistantTools: AssistantToolInfo[] | undefined
  let initialAssistantSkills: AssistantSkillInfo[] | undefined
  let initialKnowledgeBaseGroups: KBGroup[] | undefined
  let assistantEditorHydrationData: AssistantEditorHydrationData | null | undefined

  const defaultAssistantId =
    initialAssistants?.find((assistant) => assistant.isSystemDefault)?.id ??
    initialAssistants?.[0]?.id ??
    null

  const assistantId = sessionDetail?.assistantId ?? extractAssistantId(initialSessions, sessionId)

  if (assistantId) {
    try {
      const [tools, skills, groups] = await Promise.all([
        listAssistantTools(assistantId),
        listAssistantSkills(assistantId),
        listKnowledgeGroupsForDashboard(orgContext?.organizationId ?? null),
      ])

      initialAssistantTools = mapToolsForClient(tools)
      initialAssistantSkills = mapSkillsForClient(skills)
      initialKnowledgeBaseGroups = mapGroupsForClient(groups)
    } catch (error) {
      console.error("[ChatSessionPage] Failed to load chat toolbar data:", error)
    }
  }

  if (defaultAssistantId) {
    try {
      assistantEditorHydrationData = await loadAssistantEditorHydrationData({
        assistantId: defaultAssistantId,
        organizationId: orgContext?.organizationId ?? null,
      })
    } catch (error) {
      console.error("[ChatSessionPage] Failed to load assistant editor hydration data:", error)
    }
  }

  return {
    initialAssistants,
    initialSessions,
    initialAssistantTools,
    initialAssistantSkills,
    initialKnowledgeBaseGroups,
    assistantEditorHydrationData,
  }
}
