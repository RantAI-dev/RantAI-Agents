import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listAssistantsForUser, type AssistantListItem } from "@/src/features/assistants/core/service"
import { listDashboardCredentials, type DashboardCredentialSummary } from "@/src/features/credentials/service"
import { listKnowledgeGroupsForDashboard, type KnowledgeGroupListItem } from "@/src/features/knowledge/groups/service"
import { listToolsForDashboard } from "@/src/features/tools/service"
import {
  getDashboardWorkflow,
  listDashboardWorkflows,
  listWorkflowRuns,
} from "@/src/features/workflows/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"
import type { WorkflowItem } from "@/hooks/use-workflows"
import type { WorkflowRunItem } from "@/hooks/use-workflow-runs"

export interface WorkflowEditorAssistantOption {
  id: string
  name: string
  emoji: string
}

export interface WorkflowEditorCredentialOption {
  id: string
  name: string
  type: string
}

export interface WorkflowEditorToolOption {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  isBuiltIn: boolean
}

export interface WorkflowEditorKnowledgeGroupOption {
  id: string
  name: string
  documentCount: number
}

export interface WorkflowEditorPageHydration {
  initialWorkflow?: WorkflowItem
  initialWorkflows?: WorkflowItem[]
  initialRuns?: WorkflowRunItem[]
  initialAssistants?: WorkflowEditorAssistantOption[]
  initialCredentials?: WorkflowEditorCredentialOption[]
  initialTools?: WorkflowEditorToolOption[]
  initialKnowledgeBaseGroups?: WorkflowEditorKnowledgeGroupOption[]
}

function mapAssistantOptions(assistants: AssistantListItem[]): WorkflowEditorAssistantOption[] {
  return assistants.map((assistant) => ({
    id: assistant.id,
    name: assistant.name,
    emoji: assistant.emoji,
  }))
}

function mapCredentialOptions(credentials: DashboardCredentialSummary[]): WorkflowEditorCredentialOption[] {
  return credentials.map((credential) => ({
    id: credential.id,
    name: credential.name,
    type: credential.type,
  }))
}

function mapKnowledgeGroupOptions(groups: KnowledgeGroupListItem[]): WorkflowEditorKnowledgeGroupOption[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    documentCount: group.documentCount,
  }))
}

function mapToolOptions(tools: Awaited<ReturnType<typeof listToolsForDashboard>>): WorkflowEditorToolOption[] {
  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    category: tool.category,
    isBuiltIn: tool.isBuiltIn,
  }))
}

function mapWorkflow(workflow: Awaited<ReturnType<typeof listDashboardWorkflows>>[number]): WorkflowItem {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: (workflow.nodes ?? []) as WorkflowItem["nodes"],
    edges: (workflow.edges ?? []) as WorkflowItem["edges"],
    trigger: (workflow.trigger as WorkflowItem["trigger"]) || { type: "manual" },
    variables: (workflow.variables as WorkflowItem["variables"]) || { inputs: [], outputs: [] },
    mode: (workflow.mode as WorkflowItem["mode"]) || "STANDARD",
    category: (workflow.category as WorkflowItem["category"]) || "AUTOMATION",
    chatflowConfig: (workflow.chatflowConfig as WorkflowItem["chatflowConfig"]) || {},
    apiEnabled: workflow.apiEnabled,
    apiKey: workflow.apiKey,
    status: workflow.status,
    version: workflow.version,
    tags: workflow.tags || [],
    assistantId: workflow.assistantId,
    createdBy: workflow.createdBy,
    _count: { runs: workflow._count.runs },
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  }
}

function mapRun(run: Awaited<ReturnType<typeof listWorkflowRuns>>[number]): WorkflowRunItem {
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status,
    input: run.input,
    output: run.output,
    error: run.error,
    steps: run.steps as WorkflowRunItem["steps"],
    suspendedAt: run.suspendedAt ? run.suspendedAt.toISOString() : null,
    resumeData: run.resumeData,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
  }
}

export async function loadWorkflowEditorPageHydration(workflowId: string): Promise<WorkflowEditorPageHydration> {
  const session = await auth()
  if (!session?.user?.id) {
    return {}
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  const [
    assistantsResult,
    workflowsResult,
    workflowResult,
    runsResult,
    credentialsResult,
    toolsResult,
    knowledgeGroupsResult,
  ] = await Promise.all([
    listAssistantsForUser({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
    }).catch(() => [] as AssistantListItem[]),
    listDashboardWorkflows({
      organizationId: orgContext?.organizationId ?? null,
      assistantId: null,
    }).catch(() => [] as Awaited<ReturnType<typeof listDashboardWorkflows>>),
    getDashboardWorkflow(workflowId).catch(
      () => ({ status: 404, error: "Workflow not found" } as const)
    ),
    listWorkflowRuns(workflowId).catch(() => [] as Awaited<ReturnType<typeof listWorkflowRuns>>),
    listDashboardCredentials({
      organizationId: orgContext?.organizationId ?? null,
      userId: session.user.id,
    }).catch(() => [] as DashboardCredentialSummary[]),
    listToolsForDashboard(orgContext?.organizationId ?? null).catch(() => [] as Awaited<ReturnType<typeof listToolsForDashboard>>),
    listKnowledgeGroupsForDashboard(orgContext?.organizationId ?? null).catch(() => [] as KnowledgeGroupListItem[]),
  ])

  const mappedWorkflows = workflowsResult.map(mapWorkflow)
  const mappedWorkflow =
    !isHttpServiceError(workflowResult) && workflowResult
      ? mapWorkflow(workflowResult)
      : undefined

  const mergedWorkflows = mappedWorkflow
    ? mappedWorkflows.some((workflow) => workflow.id === mappedWorkflow.id)
      ? mappedWorkflows
      : [mappedWorkflow, ...mappedWorkflows]
    : mappedWorkflows

  return {
    initialWorkflow: mappedWorkflow,
    initialAssistants: mapAssistantOptions(assistantsResult),
    initialWorkflows: mergedWorkflows,
    initialRuns: runsResult.map(mapRun),
    initialCredentials: mapCredentialOptions(credentialsResult),
    initialTools: mapToolOptions(toolsResult),
    initialKnowledgeBaseGroups: mapKnowledgeGroupOptions(knowledgeGroupsResult),
  }
}
