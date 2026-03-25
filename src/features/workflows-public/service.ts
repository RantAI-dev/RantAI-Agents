import { createHmac, timingSafeEqual } from "crypto"
import type { Prisma, Workflow } from "@prisma/client"
import { checkRateLimit } from "@/lib/embed/rate-limiter"
import { workflowEngine } from "@/lib/workflow"
import { executeChatflow } from "@/lib/workflow/chatflow"
import {
  findActiveWorkflows,
  findApiEnabledWorkflowByKey,
  findDiscoverableWorkflows,
  findWorkflowById,
  findWorkflowRunById,
} from "./repository"

export interface WorkflowPublicServiceError {
  status: number
  error: string
  headers?: Record<string, string>
  body?: Record<string, unknown>
}

export interface WorkflowPublicJsonResult {
  kind: "json"
  status: number
  body: unknown
  headers?: Record<string, string>
}

export interface WorkflowPublicResponseResult {
  kind: "response"
  response: Response
}

export type WorkflowPublicServiceResult =
  | WorkflowPublicJsonResult
  | WorkflowPublicResponseResult
  | WorkflowPublicServiceError

export function isWorkflowPublicServiceError(
  value: WorkflowPublicServiceResult
): value is WorkflowPublicServiceError {
  return (value as WorkflowPublicJsonResult).kind === undefined
}

interface WorkflowTrigger {
  type?: string
  webhookPath?: string
  webhookSecret?: string
}

interface WorkflowStepLog {
  nodeId: string
  status: string
  output: unknown
}

function toWorkflowTrigger(value: unknown): WorkflowTrigger {
  if (!value || typeof value !== "object") {
    return {}
  }

  const record = value as Record<string, unknown>
  return {
    type: typeof record.type === "string" ? record.type : undefined,
    webhookPath:
      typeof record.webhookPath === "string" ? record.webhookPath : undefined,
    webhookSecret:
      typeof record.webhookSecret === "string"
        ? record.webhookSecret
        : undefined,
  }
}

function verifyWebhookSignature(
  payload: string,
  secret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) {
    return false
  }

  const expectedDigest = createHmac("sha256", secret).update(payload).digest("hex")
  const expectedSignature = `sha256=${expectedDigest}`
  if (expectedSignature.length !== signatureHeader.length) {
    return false
  }

  try {
    return timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHeader)
    )
  } catch {
    return false
  }
}

function parseJsonBody(rawBody: string): unknown {
  if (!rawBody.trim()) {
    return {}
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return {}
  }
}

function getChatflowMessage(input: unknown): string {
  if (typeof input === "string") {
    return input
  }

  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>
    if (typeof record.message === "string") {
      return record.message
    }
    return JSON.stringify(input)
  }

  return ""
}

function findWebhookWorkflowByPath(workflows: Workflow[], path: string) {
  return workflows.find((workflow) => {
    const trigger = toWorkflowTrigger(workflow.trigger)
    return trigger.type === "webhook" && trigger.webhookPath === path
  })
}

function getPausedWorkflowOutput(run: {
  status: string
  output: Prisma.JsonValue | null
  steps: Prisma.JsonValue | null
}) {
  if (run.status !== "PAUSED" || run.output) {
    return run.output
  }

  if (!Array.isArray(run.steps)) {
    return run.output
  }

  const partialOutput: Record<string, unknown> = {}
  for (const step of run.steps as unknown as WorkflowStepLog[]) {
    if (step.status === "success" && step.output != null) {
      partialOutput[step.nodeId] = step.output
    }
  }

  return partialOutput
}

/**
 * Executes a public workflow by id with API key auth.
 */
export async function runPublicWorkflowById(params: {
  workflowId: string
  apiKey: string | null
  input: unknown
}): Promise<WorkflowPublicServiceResult> {
  try {
    if (!params.apiKey) {
      return { status: 401, error: "Missing x-api-key header" }
    }

    const workflow = await findWorkflowById(params.workflowId)
    if (!workflow) {
      return { status: 404, error: "Workflow not found" }
    }

    if (!workflow.apiEnabled || workflow.apiKey !== params.apiKey) {
      return { status: 403, error: "Invalid API key" }
    }

    const rateLimit = checkRateLimit(`workflow:${params.apiKey}`)
    if (!rateLimit.allowed) {
      return {
        status: 429,
        error: "Rate limit exceeded",
        headers: { "Retry-After": String(rateLimit.resetIn) },
        body: { retryAfter: rateLimit.resetIn },
      }
    }

    if (workflow.status !== "ACTIVE") {
      return {
        status: 400,
        error: "Workflow is not active",
        body: { status: workflow.status },
      }
    }

    if (workflow.mode === "CHATFLOW") {
      const message = getChatflowMessage(params.input)
      const { response } = await executeChatflow(workflow, message)
      if (!response) {
        return {
          status: 500,
          error: "Chatflow execution failed",
        }
      }
      return { kind: "response", response }
    }

    const runId = await workflowEngine.execute(
      params.workflowId,
      (params.input ?? {}) as unknown as Record<string, unknown>
    )
    const run = await findWorkflowRunById(runId)

    return {
      kind: "json",
      status: 200,
      body: {
        runId: run?.id,
        status: run?.status,
        output: run
          ? getPausedWorkflowOutput({
              status: run.status,
              output: run.output,
              steps: run.steps,
            })
          : undefined,
        error: run?.error,
        startedAt: run?.startedAt,
        completedAt: run?.completedAt,
      },
    }
  } catch (error) {
    console.error("[Workflow API] Execution error:", error)
    return {
      status: 500,
      error: error instanceof Error ? error.message : "Execution failed",
    }
  }
}

/**
 * Executes a webhook-triggered workflow.
 */
export async function executePublicWorkflowWebhookPost(params: {
  path: string
  rawBody: string
  signatureHeader: string | null
  requestHeaders: Record<string, string>
}): Promise<WorkflowPublicServiceResult> {
  try {
    const workflows = await findActiveWorkflows()
    const workflow = findWebhookWorkflowByPath(workflows, params.path)
    if (!workflow) {
      return { status: 404, error: "No workflow found for webhook path" }
    }

    const trigger = toWorkflowTrigger(workflow.trigger)
    if (trigger.webhookSecret) {
      const isValid = verifyWebhookSignature(
        params.rawBody,
        trigger.webhookSecret,
        params.signatureHeader
      )

      if (!isValid) {
        return { status: 401, error: "Invalid webhook signature" }
      }
    }

    const body = parseJsonBody(params.rawBody)
    const input = {
      ...(body && typeof body === "object" ? body : {}),
      _webhook: {
        path: params.path,
        method: "POST",
        headers: params.requestHeaders,
        receivedAt: new Date().toISOString(),
      },
    }

    if (workflow.mode === "CHATFLOW") {
      const message = getChatflowMessage(body)
      const { response } = await executeChatflow(workflow, message)
      if (!response) {
        return {
          status: 500,
          error: "Chatflow execution failed",
        }
      }
      return { kind: "response", response }
    }

    const runId = await workflowEngine.execute(workflow.id, input)
    const run = await findWorkflowRunById(runId)

    return {
      kind: "json",
      status: 200,
      body: {
        runId: run?.id,
        status: run?.status,
        output: run?.output,
        startedAt: run?.startedAt,
        completedAt: run?.completedAt,
      },
    }
  } catch (error) {
    console.error("[Webhook] Execution error:", error)
    return {
      status: 500,
      error: error instanceof Error ? error.message : "Webhook execution failed",
    }
  }
}

/**
 * Returns webhook readiness metadata for a path.
 */
export async function getPublicWorkflowWebhookStatus(path: string) {
  const workflows = await findActiveWorkflows()
  const workflow = findWebhookWorkflowByPath(workflows, path)
  if (!workflow) {
    return { status: 404, error: "No workflow found for webhook path" }
  }

  return {
    kind: "json" as const,
    status: 200,
    body: {
      webhook: path,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: "ready",
    },
  }
}

/**
 * Discovers public workflows with optional filters.
 */
export async function discoverPublicWorkflows(params: {
  apiKey: string | null
  query: {
    name?: string
    mode?: "STANDARD" | "CHATFLOW"
    apiEnabled?: "true" | "false"
  }
}): Promise<WorkflowPublicServiceResult> {
  if (!params.apiKey) {
    return { status: 401, error: "API key required" }
  }

  const validWorkflow = await findApiEnabledWorkflowByKey(params.apiKey)
  if (!validWorkflow) {
    return { status: 403, error: "Invalid API key" }
  }

  const where: Prisma.WorkflowWhereInput = { status: "ACTIVE" }
  if (params.query.name) {
    where.name = {
      contains: params.query.name,
      mode: "insensitive",
    }
  }

  if (params.query.mode) {
    where.mode = params.query.mode
  }

  if (params.query.apiEnabled === "true") {
    where.apiEnabled = true
  }

  const workflows = await findDiscoverableWorkflows(where)
  return {
    kind: "json",
    status: 200,
    body: workflows,
  }
}
