import { workflowEngine } from "@/lib/workflow"
import { deleteExpiredUserMemories, findActiveWorkflows } from "./repository"

export interface ServiceError {
  status: number
  error: string
}

interface WorkflowExecutionResult {
  workflowId: string
  name: string
  runId?: string
  error?: string
}

export interface CronWorkflowDeps {
  executeWorkflow?: typeof workflowEngine.execute
}

function getDeps(deps?: CronWorkflowDeps) {
  return {
    executeWorkflow: deps?.executeWorkflow ?? workflowEngine.execute.bind(workflowEngine),
  }
}

/**
 * Runs scheduled workflows that match the current minute.
 */
export async function runWorkflowCron(
  params: {
    authorizationHeader?: string | null
    cronSecret?: string
    nodeEnv?: string
    now?: Date
  },
  deps?: CronWorkflowDeps
) {
  if (!params.cronSecret && params.nodeEnv === "production") {
    return { status: 401, error: "CRON_SECRET not configured" } satisfies ServiceError
  }

  if (params.cronSecret) {
    if (params.authorizationHeader !== `Bearer ${params.cronSecret}`) {
      return { status: 401, error: "Unauthorized" } satisfies ServiceError
    }
  }

  const now = params.now ?? new Date()
  const { executeWorkflow } = getDeps(deps)

  let expiredMemoryCount = 0
  try {
    const deleted = await deleteExpiredUserMemories(now)
    expiredMemoryCount = deleted.count
  } catch (error) {
    console.error("[Cron] Memory cleanup error:", error)
  }

  const workflows = await findActiveWorkflows()

  const scheduledWorkflows = workflows.filter((workflow) => {
    const trigger = workflow.trigger as { type?: string; schedule?: string }
    return trigger?.type === "schedule" && Boolean(trigger?.schedule)
  })

  if (scheduledWorkflows.length === 0) {
    return {
      executed: 0,
      expiredMemoryCount,
      message: "No scheduled workflows",
    }
  }

  const results: WorkflowExecutionResult[] = []

  for (const workflow of scheduledWorkflows) {
    const trigger = workflow.trigger as { schedule: string }

    if (!matchesCron(trigger.schedule, now)) {
      continue
    }

    try {
      const runId = await executeWorkflow(workflow.id, {
        _trigger: "schedule",
        _schedule: trigger.schedule,
        _triggeredAt: now.toISOString(),
      })

      results.push({ workflowId: workflow.id, name: workflow.name, runId })
    } catch (error) {
      results.push({
        workflowId: workflow.id,
        name: workflow.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    executed: results.length,
    expiredMemoryCount,
    results,
    checkedAt: now.toISOString(),
  }
}

export function matchesCron(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const fields = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ]

  return parts.every((part, index) => matchesCronField(part, fields[index]))
}

function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true

  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10)
    return !Number.isNaN(step) && step > 0 && value % step === 0
  }

  if (field.includes(",")) {
    return field
      .split(",")
      .some((part) => matchesCronField(part.trim(), value))
  }

  if (field.includes("-")) {
    const [min, max] = field.split("-").map(Number)
    return !Number.isNaN(min) && !Number.isNaN(max) && value >= min && value <= max
  }

  return parseInt(field, 10) === value
}
