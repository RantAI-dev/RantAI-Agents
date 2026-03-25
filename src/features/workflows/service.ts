import { Prisma, type WorkflowCategory, type WorkflowMode, type WorkflowStatus } from "@prisma/client"
import { loadUserProfile, loadWorkingMemory, semanticRecall, updateWorkingMemory, storeForSemanticRecall, getMastraMemory, MEMORY_CONFIG } from "@/lib/memory"
import { executeChatflow, type ChatflowMemoryContext } from "@/lib/workflow/chatflow"
import { exportWorkflow, importWorkflow, type WorkflowExportFormat } from "@/lib/workflow/import-export"
import { emitWorkflowEvent, workflowEngine, type WorkflowEngine } from "@/lib/workflow"
import { extractAndSaveFacts, stripSources } from "@/lib/workflow/chatflow-memory"
import type { Workflow } from "@prisma/client"
import {
  createWorkflowRun,
  createWorkflowWithCount,
  deleteWorkflowById,
  findWorkflowApiKeyById,
  findWorkflowById,
  findWorkflowRunById,
  findWorkflowRunsByWorkflowId,
  findWorkflowsByScope,
  updateWorkflowById,
  updateWorkflowRunById,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface WorkflowExecutionDependencies {
  workflowEngine?: WorkflowEngine
  executeChatflow?: typeof executeChatflow
  loadWorkingMemory?: typeof loadWorkingMemory
  semanticRecall?: typeof semanticRecall
  loadUserProfile?: typeof loadUserProfile
  updateWorkingMemory?: typeof updateWorkingMemory
  storeForSemanticRecall?: typeof storeForSemanticRecall
  getMastraMemory?: typeof getMastraMemory
  extractAndSaveFacts?: typeof extractAndSaveFacts
  stripSources?: typeof stripSources
}

export interface WorkflowExecuteJsonResult {
  kind: "json"
  status: number
  body: unknown
}

export interface WorkflowExecuteResponseResult {
  kind: "response"
  response: Response
}

export type WorkflowExecuteResult = WorkflowExecuteJsonResult | WorkflowExecuteResponseResult

function getExecutionDeps(deps?: WorkflowExecutionDependencies): Required<WorkflowExecutionDependencies> {
  return {
    workflowEngine: deps?.workflowEngine ?? workflowEngine,
    executeChatflow: deps?.executeChatflow ?? executeChatflow,
    loadWorkingMemory: deps?.loadWorkingMemory ?? loadWorkingMemory,
    semanticRecall: deps?.semanticRecall ?? semanticRecall,
    loadUserProfile: deps?.loadUserProfile ?? loadUserProfile,
    updateWorkingMemory: deps?.updateWorkingMemory ?? updateWorkingMemory,
    storeForSemanticRecall: deps?.storeForSemanticRecall ?? storeForSemanticRecall,
    getMastraMemory: deps?.getMastraMemory ?? getMastraMemory,
    extractAndSaveFacts: deps?.extractAndSaveFacts ?? extractAndSaveFacts,
    stripSources: deps?.stripSources ?? stripSources,
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

/**
 * Lists workflows visible to the current dashboard scope.
 */
export async function listDashboardWorkflows(params: {
  organizationId: string | null
  assistantId: string | null
}) {
  return findWorkflowsByScope(params)
}

/**
 * Creates a new dashboard workflow with legacy defaults preserved.
 */
export async function createDashboardWorkflow(params: {
  actorUserId: string
  organizationId: string | null
  input: {
    name?: string
    description?: string
    assistantId?: string
    tags?: unknown
    category?: string
  }
}): Promise<unknown | ServiceError> {
  if (!params.input.name) {
    return { status: 400, error: "Name is required" }
  }

  return createWorkflowWithCount({
    name: params.input.name,
    description: params.input.description || null,
    ...(params.input.tags !== undefined && { tags: params.input.tags as string[] }),
    ...(params.input.category !== undefined && { category: params.input.category as WorkflowCategory }),
    assistantId: params.input.assistantId || null,
    organizationId: params.organizationId || null,
    createdBy: params.actorUserId,
  })
}

/**
 * Imports a workflow JSON payload and stores it as a new draft workflow.
 */
export async function importDashboardWorkflow(params: {
  actorUserId: string
  organizationId: string | null
  input: unknown
}): Promise<unknown | ServiceError> {
  try {
    const imported = importWorkflow(params.input)

    return createWorkflowWithCount({
      name: `${imported.name} (imported)`,
      description: imported.description,
      nodes: imported.nodes as unknown as Prisma.InputJsonValue,
      edges: imported.edges as unknown as Prisma.InputJsonValue,
      trigger: imported.trigger as unknown as Prisma.InputJsonValue,
      variables: imported.variables as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      createdBy: params.actorUserId,
      ...(params.organizationId && { organizationId: params.organizationId }),
    })
  } catch (error) {
    return {
      status: 400,
      error: error instanceof Error ? error.message : "Failed to import workflow",
    }
  }
}

/**
 * Loads a single workflow for dashboard inspection.
 */
export async function getDashboardWorkflow(id: string) {
  const workflow = await findWorkflowById(id)
  if (!workflow) {
    return { status: 404, error: "Workflow not found" } satisfies ServiceError
  }

  return workflow
}

/**
 * Updates a dashboard workflow while preserving legacy API key behavior.
 */
export async function updateDashboardWorkflow(params: {
  id: string
  input: {
    name?: string
    description?: string
    nodes?: unknown
    edges?: unknown
    trigger?: unknown
    variables?: unknown
    status?: string
    mode?: string
    category?: string
    chatflowConfig?: unknown
    apiEnabled?: boolean
    assistantId?: string
    tags?: unknown
  }
}): Promise<unknown | ServiceError> {
  let apiKey: string | undefined
  if (params.input.apiEnabled === true) {
    const existing = await findWorkflowApiKeyById(params.id)
    if (!existing?.apiKey) {
      apiKey = `wf_${params.id.slice(0, 8)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
    }
  }

  return updateWorkflowById(params.id, {
    ...(params.input.name !== undefined && { name: params.input.name }),
    ...(params.input.description !== undefined && { description: params.input.description }),
    ...(params.input.nodes !== undefined && { nodes: params.input.nodes as Prisma.InputJsonValue }),
    ...(params.input.edges !== undefined && { edges: params.input.edges as Prisma.InputJsonValue }),
    ...(params.input.trigger !== undefined && { trigger: params.input.trigger as Prisma.InputJsonValue }),
    ...(params.input.variables !== undefined && { variables: params.input.variables as Prisma.InputJsonValue }),
    ...(params.input.status !== undefined && { status: params.input.status as WorkflowStatus }),
    ...(params.input.mode !== undefined && { mode: params.input.mode as WorkflowMode }),
    ...(params.input.category !== undefined && { category: params.input.category as WorkflowCategory }),
    ...(params.input.chatflowConfig !== undefined && { chatflowConfig: params.input.chatflowConfig as Prisma.InputJsonValue }),
    ...(params.input.apiEnabled !== undefined && { apiEnabled: params.input.apiEnabled }),
    ...(params.input.tags !== undefined && { tags: params.input.tags as string[] }),
    ...(params.input.assistantId !== undefined && { assistantId: params.input.assistantId || null }),
    ...(apiKey && { apiKey }),
    ...(params.input.apiEnabled === false && { apiKey: null }),
  })
}

/**
 * Deletes a dashboard workflow.
 */
export async function deleteDashboardWorkflow(id: string): Promise<{ success: true } | ServiceError> {
  await deleteWorkflowById(id)
  return { success: true }
}

/**
 * Exports a workflow in the legacy import/export JSON format.
 */
export async function exportDashboardWorkflow(id: string): Promise<
  | {
      name: string
      exportData: WorkflowExportFormat
    }
  | ServiceError
> {
  const workflow = await findWorkflowById(id)
  if (!workflow) {
    return { status: 404, error: "Workflow not found" }
  }

  return {
    name: workflow.name,
    exportData: exportWorkflow({
      name: workflow.name,
      description: workflow.description,
      mode: (workflow as unknown as { mode?: string }).mode,
      trigger: workflow.trigger as unknown,
      variables: workflow.variables as unknown,
      nodes: (workflow.nodes as unknown[]) || [],
      edges: (workflow.edges as unknown[]) || [],
    }),
  }
}

/**
 * Lists runs for a workflow.
 */
export async function listWorkflowRuns(workflowId: string) {
  return findWorkflowRunsByWorkflowId(workflowId, 50)
}

/**
 * Loads a single workflow run for dashboard inspection.
 */
export async function getWorkflowRun(runId: string) {
  const run = await findWorkflowRunById(runId)
  if (!run) {
    return { status: 404, error: "Run not found" } satisfies ServiceError
  }
  return run
}

/**
 * Resumes a paused workflow run using the workflow engine.
 */
export async function resumeWorkflowRun(params: {
  runId: string
  stepId?: string
  data?: unknown
  deps?: { workflowEngine?: WorkflowEngine }
}): Promise<unknown | ServiceError> {
  const run = await findWorkflowRunById(params.runId)
  if (!run) {
    return { status: 404, error: "Run not found" }
  }

  if (run.status !== "PAUSED") {
    return { status: 400, error: "Run is not paused" }
  }

  const deps = params.deps?.workflowEngine ?? workflowEngine
  await deps.resume(params.runId, params.stepId as string, params.data)

  return findWorkflowRunById(params.runId)
}

/**
 * Executes a dashboard workflow in standard or chatflow mode.
 */
export async function executeDashboardWorkflow(params: {
  workflowId: string
  userId: string
  organizationId: string | null
  input: unknown
  threadId?: string
  deps?: WorkflowExecutionDependencies
}): Promise<WorkflowExecuteResult | ServiceError> {
  const workflow = await findWorkflowById(params.workflowId)
  if (!workflow) {
    return { status: 404, error: "Workflow not found" }
  }

  const deps = getExecutionDeps(params.deps)
  const executionInput = params.input || {}

  if ((workflow as Workflow).mode === "CHATFLOW") {
    const threadId = params.threadId || `test_${workflow.id}_${Date.now()}`
    const messageInput =
      typeof params.input === "string"
        ? params.input
        : (executionInput as Record<string, unknown>).message ||
          (executionInput as Record<string, unknown>).question ||
          executionInput
    const message = typeof messageInput === "string" ? messageInput : JSON.stringify(messageInput)

    const run = await createWorkflowRun({
      workflow: { connect: { id: workflow.id } },
      status: "RUNNING",
      input: toJsonValue({ message }),
      steps: [],
    })

    let memoryContext: ChatflowMemoryContext | undefined
    try {
      const workingMemory = await deps.loadWorkingMemory(threadId)

      let semanticResults: Awaited<ReturnType<typeof semanticRecall>> = []
      if (MEMORY_CONFIG.useMastraMemory) {
        try {
          const mastraMemory = deps.getMastraMemory()
          semanticResults = await mastraMemory.recall(message, {
            resourceId: `test_user_${workflow.id}`,
            threadId,
            topK: 5,
          })
        } catch {
          if (MEMORY_CONFIG.gracefulDegradation) {
            semanticResults = await deps.semanticRecall(message, `test_user_${workflow.id}`, threadId)
          }
        }
      } else {
        semanticResults = await deps.semanticRecall(message, `test_user_${workflow.id}`, threadId)
      }

      const userProfile = await deps.loadUserProfile(`test_user_${workflow.id}`)
      memoryContext = { workingMemory, semanticResults, userProfile }
    } catch (error) {
      console.error("[Execute] Memory load error:", error)
    }

    const systemContext =
      typeof executionInput === "object" && executionInput !== null && "system_context" in executionInput
        ? String((executionInput as Record<string, unknown>).system_context)
        : undefined

    const { response, stepLogs } = await deps.executeChatflow(
      workflow as Workflow,
      message,
      systemContext,
      memoryContext,
      run.id
    )

    if (!response) {
      const lastOutput = stepLogs.filter((s) => s.output).pop()?.output
      const text = typeof lastOutput === "string" ? lastOutput : JSON.stringify(lastOutput ?? "No output")
      const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", "X-Run-Id": run.id })
      await updateWorkflowRunById(run.id, {
        status: "COMPLETED",
        output: toJsonValue({ text }),
        steps: toJsonValue(JSON.parse(JSON.stringify(stepLogs))),
        completedAt: new Date(),
      })
      return { kind: "response", response: new Response(text, { headers }) }
    }

    const streamBody = response.body
    if (streamBody) {
      const [clientStream, saveStream] = streamBody.tee()

      void (async () => {
        try {
          const reader = saveStream.getReader()
          const decoder = new TextDecoder()
          let fullResponse = ""
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            fullResponse += decoder.decode(value, { stream: true })
          }

          if (!fullResponse.trim()) return

          const cleanResponse = deps.stripSources(fullResponse)
          const messageId = `msg_${Date.now()}`

          await deps.updateWorkingMemory(`test_user_${workflow.id}`, threadId, message, cleanResponse, messageId, [], [])
          await deps.storeForSemanticRecall(`test_user_${workflow.id}`, threadId, message, cleanResponse)

          if (MEMORY_CONFIG.dualWrite) {
            try {
              const mastraMemory = deps.getMastraMemory()
              await mastraMemory.saveMessage(threadId, { role: "user", content: message, metadata: { userId: `test_user_${workflow.id}`, messageId, timestamp: new Date().toISOString() } })
              await mastraMemory.saveMessage(threadId, { role: "assistant", content: cleanResponse, metadata: { userId: `test_user_${workflow.id}`, messageId, timestamp: new Date().toISOString() } })
            } catch (mastraErr) {
              console.error("[Execute] Mastra dual-write error (non-fatal):", mastraErr)
            }
          }

          await deps.extractAndSaveFacts(`test_user_${workflow.id}`, threadId, message, cleanResponse)

          await updateWorkflowRunById(run.id, {
            status: "COMPLETED",
            output: toJsonValue({ text: cleanResponse }),
            steps: toJsonValue(JSON.parse(JSON.stringify(stepLogs))),
            completedAt: new Date(),
          })

          emitWorkflowEvent(run.id, "workflow:run:complete", {
            status: "COMPLETED",
            durationMs: Date.now() - run.startedAt.getTime(),
          })
        } catch (error) {
          console.error("[Execute] Chatflow memory save error:", error)
          await updateWorkflowRunById(run.id, {
            status: "FAILED",
            error: String(error),
            steps: toJsonValue(JSON.parse(JSON.stringify(stepLogs))),
            completedAt: new Date(),
          }).catch(() => {})
        }
      })()

      const headers = new Headers(response.headers)
      headers.set("X-Run-Id", run.id)
      return { kind: "response", response: new Response(clientStream, { headers }) }
    }

    await updateWorkflowRunById(run.id, {
      status: "COMPLETED",
      steps: toJsonValue(JSON.parse(JSON.stringify(stepLogs))),
      completedAt: new Date(),
    })

    return { kind: "response", response }
  }

  const runId = await deps.workflowEngine.executeAsync(
    params.workflowId,
    executionInput as Record<string, unknown>,
    {
    userId: params.userId,
    organizationId: params.organizationId || undefined,
  }
  )

  const run = await findWorkflowRunById(runId)
  return {
    kind: "json",
    status: 201,
    body: run,
  }
}
