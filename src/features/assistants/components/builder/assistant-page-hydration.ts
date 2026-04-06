import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { listAssistantsForUser, type AssistantListItem } from "@/features/assistants/core/service"
import { listKnowledgeGroupsForDashboard, type KnowledgeGroupListItem } from "@/features/knowledge/groups/service"
import type { DbAssistant } from "@/hooks/use-assistants"

function mapAssistantToDbAssistant(assistant: AssistantListItem): DbAssistant {
  return {
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
  }
}

export interface BuilderKnowledgeGroup {
  id: string
  name: string
  color: string | null
  documentCount: number
}

function mapKnowledgeGroupToBuilderGroup(group: KnowledgeGroupListItem): BuilderKnowledgeGroup {
  return {
    id: group.id,
    name: group.name,
    color: group.color,
    documentCount: group.documentCount,
  }
}

export async function loadInitialAssistantsForBuilder(): Promise<DbAssistant[]> {
  const session = await auth()
  if (!session?.user?.id) {
    return []
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContext(request, session.user.id)

  const assistants = await listAssistantsForUser({
    organizationId: orgContext?.organizationId ?? null,
    role: orgContext?.membership.role ?? null,
  })

  return assistants.map(mapAssistantToDbAssistant)
}

export async function loadInitialKnowledgeGroupsForBuilder(): Promise<BuilderKnowledgeGroup[]> {
  const session = await auth()
  if (!session?.user?.id) {
    return []
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContext(request, session.user.id)

  const groups = await listKnowledgeGroupsForDashboard(orgContext?.organizationId ?? null)
  return groups.map(mapKnowledgeGroupToBuilderGroup)
}
