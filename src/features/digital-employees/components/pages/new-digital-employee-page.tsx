import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listAssistantsForUser } from "@/features/assistants/core/service"
import { listGroupsForDashboard } from "@/features/digital-employees/groups/service"
import { listDashboardTemplates } from "@/features/templates/service"
import NewDigitalEmployeePageClient from "./new-digital-employee-page-client"
import type { DbAssistant } from "@/hooks/use-assistants"
import type { EmployeeGroupItem } from "@/hooks/use-employee-groups"

interface SearchParams {
  groupId?: string
}

function mapAssistantsForClient(
  assistants: Awaited<ReturnType<typeof listAssistantsForUser>>
): DbAssistant[] {
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

function mapGroupsForClient(
  groups: Awaited<ReturnType<typeof listGroupsForDashboard>>
): EmployeeGroupItem[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    status: group.status,
    isImplicit: group.isImplicit,
    containerPort: group.containerPort,
    noVncPort: group.noVncPort,
    members: group.members,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }))
}

function mapTemplatesForClient(
  templates: Awaited<ReturnType<typeof listDashboardTemplates>>
) {
  return templates
    .filter((template) => template.category !== "pipeline")
    .map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      templateData: template.templateData as Record<string, unknown>,
      isPublic: template.isPublic,
    }))
}

export default async function NewDigitalEmployeePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  const resolvedSearchParams = await searchParams

  if (!session?.user?.id) {
    return (
      <NewDigitalEmployeePageClient
        preselectedGroupId={resolvedSearchParams.groupId ?? null}
        initialAssistants={[]}
        initialGroups={[]}
        initialTemplates={[]}
      />
    )
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  const [assistants, groups, templates] = await Promise.all([
    listAssistantsForUser({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
    }),
    orgContext?.organizationId ? listGroupsForDashboard(orgContext.organizationId) : Promise.resolve([]),
    orgContext?.organizationId
      ? listDashboardTemplates(orgContext.organizationId)
      : Promise.resolve([]),
  ])

  return (
    <NewDigitalEmployeePageClient
      preselectedGroupId={resolvedSearchParams.groupId ?? null}
      initialAssistants={mapAssistantsForClient(assistants)}
      initialGroups={mapGroupsForClient(groups)}
      initialTemplates={mapTemplatesForClient(templates)}
    />
  )
}
