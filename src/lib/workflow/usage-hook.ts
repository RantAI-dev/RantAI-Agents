/**
 * Workflow model-usage reporting seam.
 *
 * Workflow LLM/Agent/Stream nodes call generateText/streamText directly, so
 * their token usage was never metered. This hook lets the cloud edition attach
 * a reporter (which deducts credits / logs rantai usage) without the OSS engine
 * depending on billing. The reporter is fire-and-forget — reporting never blocks
 * or fails a node.
 */
export interface WorkflowModelUsage {
  organizationId?: string
  userId?: string
  modelId: string
  inputTokens: number
  outputTokens: number
}

type Reporter = (usage: WorkflowModelUsage) => void | Promise<void>

let reporter: Reporter | null = null

/** Cloud sets this once at startup to meter workflow model usage. */
export function setWorkflowUsageReporter(fn: Reporter | null): void {
  reporter = fn
}

/** Called by node executors after a model call. Never throws. */
export function reportWorkflowUsage(usage: WorkflowModelUsage): void {
  if (!reporter) return
  try {
    const r = reporter(usage)
    if (r && typeof (r as Promise<void>).catch === "function") {
      ;(r as Promise<void>).catch((e) => console.error("[workflow-usage] report failed:", e))
    }
  } catch (e) {
    console.error("[workflow-usage] report failed:", e)
  }
}
