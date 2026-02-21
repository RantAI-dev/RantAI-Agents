import type { Node, Edge } from "@xyflow/react"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { WorkflowNodeData, StepLogEntry, LoopNodeData, ErrorHandlerNodeData } from "./types"
import { NodeType } from "./types"
import { compileWorkflow, createStepLog, type CompiledStep } from "./compiler"
import { validateWorkflow } from "./utils"
import type { FlowState } from "./runtime-state"
import { createFlowState, rebuildFlowState } from "./runtime-state"
import type { TemplateContext } from "./template-engine"
import { getIOInstance } from "@/lib/socket"

/**
 * Emit a workflow execution event to all clients watching a run.
 * Non-blocking — failures are silently ignored to never break execution.
 */
/** Extract token usage from AI node outputs (LLM, Agent, Stream) */
export function extractTokenUsage(output: unknown): StepLogEntry["tokenUsage"] | undefined {
  if (!output || typeof output !== "object") return undefined
  const obj = output as Record<string, unknown>
  const usage = obj.usage as Record<string, unknown> | undefined
  if (!usage) return undefined
  const promptTokens = typeof usage.promptTokens === "number" ? usage.promptTokens : 0
  const completionTokens = typeof usage.completionTokens === "number" ? usage.completionTokens : 0
  if (promptTokens === 0 && completionTokens === 0) return undefined
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
}

export function emitWorkflowEvent(runId: string, event: string, payload: Record<string, unknown>) {
  try {
    const io = getIOInstance()
    if (io) {
      io.to(`workflow:${runId}`).emit(event, { runId, ...payload })
    }
  } catch {
    // Never let socket errors break workflow execution
  }
}

// Node handlers
import { executeTrigger } from "./nodes/trigger"
import { executeAgent } from "./nodes/agent"
import { executeLlm } from "./nodes/llm"
import { executeTool } from "./nodes/tool"
import { executeCondition } from "./nodes/condition"
import { executeLoop } from "./nodes/loop"
import { executeHuman } from "./nodes/human"
import { executeData } from "./nodes/data"
import { executeIntegration } from "./nodes/integration"
import { executeStreamOutput } from "./nodes/stream"
import { executeErrorHandler } from "./nodes/error-handler"
import { executeSubWorkflow } from "./nodes/sub-workflow"

export interface ExecutionContext {
  workflowId: string
  runId: string
  variables: Record<string, unknown>
  stepOutputs: Map<string, unknown>
  flow: FlowState
}

type NodeHandler = (
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
) => Promise<{ output: unknown; branch?: string; suspend?: boolean }>

const NODE_HANDLERS: Partial<Record<NodeType, NodeHandler>> = {
  [NodeType.TRIGGER_MANUAL]: executeTrigger,
  [NodeType.TRIGGER_WEBHOOK]: executeTrigger,
  [NodeType.TRIGGER_SCHEDULE]: executeTrigger,
  [NodeType.TRIGGER_EVENT]: executeTrigger,
  [NodeType.AGENT]: executeAgent,
  [NodeType.LLM]: executeLlm,
  [NodeType.TOOL]: executeTool,
  [NodeType.MCP_TOOL]: executeTool,
  [NodeType.CODE]: executeTool,
  [NodeType.HTTP]: executeTool,
  [NodeType.CONDITION]: executeCondition,
  [NodeType.SWITCH]: executeCondition,
  [NodeType.LOOP]: executeLoop,
  [NodeType.PARALLEL]: executeData, // parallel just passes through
  [NodeType.MERGE]: executeData,
  [NodeType.HUMAN_INPUT]: executeHuman,
  [NodeType.APPROVAL]: executeHuman,
  [NodeType.HANDOFF]: executeHuman,
  [NodeType.TRANSFORM]: executeData,
  [NodeType.FILTER]: executeData,
  [NodeType.AGGREGATE]: executeData,
  [NodeType.OUTPUT_PARSER]: executeData,
  [NodeType.RAG_SEARCH]: executeIntegration,
  [NodeType.DATABASE]: executeIntegration,
  [NodeType.STORAGE]: executeIntegration,
  [NodeType.ERROR_HANDLER]: executeErrorHandler,
  [NodeType.SUB_WORKFLOW]: executeSubWorkflow,
  [NodeType.STREAM_OUTPUT]: executeStreamOutput,
}

export class WorkflowEngine {
  /**
   * Execute a workflow from scratch (synchronous — waits for completion).
   */
  async execute(
    workflowId: string,
    input: Record<string, unknown> = {}
  ): Promise<string> {
    const run = await this.prepareRun(workflowId, input)
    await this.runToCompletion(run.id, run.compiled, run.context, run.stepLogs, run.startTime, run.input)
    return run.id
  }

  /**
   * Execute a workflow asynchronously — returns runId immediately so clients
   * can subscribe to Socket.io events before steps start executing.
   */
  async executeAsync(
    workflowId: string,
    input: Record<string, unknown> = {}
  ): Promise<string> {
    const run = await this.prepareRun(workflowId, input)

    // Fire-and-forget: execution runs in background, client gets runId immediately
    this.runToCompletion(run.id, run.compiled, run.context, run.stepLogs, run.startTime, run.input)
      .catch((err) => console.error(`[WorkflowEngine] Background execution error for run ${run.id}:`, err))

    return run.id
  }

  /**
   * Prepare a workflow run: validate, compile, create DB record, build context.
   * Shared between execute() and executeAsync().
   */
  private async prepareRun(workflowId: string, input: Record<string, unknown>) {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    })
    if (!workflow) throw new Error("Workflow not found")

    const nodes = (workflow.nodes as unknown as Node<WorkflowNodeData>[]) || []
    const edges = (workflow.edges as unknown as Edge[]) || []

    const validation = validateWorkflow(nodes, edges)
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(", ")}`)
    }

    const run = await prisma.workflowRun.create({
      data: {
        workflowId,
        status: "RUNNING",
        input: input as Prisma.InputJsonValue,
        steps: [],
      },
    })

    const compiled = compileWorkflow(nodes, edges)

    const triggerNode = nodes.find((n) =>
      (n.data as WorkflowNodeData).nodeType?.startsWith("trigger_")
    )
    const triggerType = (triggerNode?.data as WorkflowNodeData)?.nodeType ?? "trigger_manual"

    const flow = createFlowState(workflowId, run.id, input, triggerType)
    const context: ExecutionContext = {
      workflowId,
      runId: run.id,
      variables: { ...input },
      stepOutputs: new Map(),
      flow,
    }

    return {
      id: run.id,
      compiled,
      context,
      stepLogs: [] as StepLogEntry[],
      startTime: Date.now(),
      input,
    }
  }

  /**
   * Execute all steps and update the WorkflowRun record on completion/failure/pause.
   */
  private async runToCompletion(
    runId: string,
    compiled: ReturnType<typeof compileWorkflow>,
    context: ExecutionContext,
    stepLogs: StepLogEntry[],
    runStartTime: number,
    input: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.executeStep(compiled.triggerNodeId, compiled, context, stepLogs, input)

      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          output: JSON.parse(JSON.stringify(Object.fromEntries(context.stepOutputs))) as Prisma.InputJsonValue,
          steps: JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })

      emitWorkflowEvent(runId, "workflow:run:complete", {
        status: "COMPLETED",
        durationMs: Date.now() - runStartTime,
      })
    } catch (error) {
      const isSuspend = error instanceof SuspendError
      const stepsJson = JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue

      if (isSuspend) {
        await prisma.workflowRun.update({
          where: { id: runId },
          data: {
            status: "PAUSED",
            steps: stepsJson,
            suspendedAt: new Date().toISOString(),
            resumeData: {
              stepId: (error as SuspendError).stepId,
              nodeId: (error as SuspendError).nodeId,
            },
          },
        })

        emitWorkflowEvent(runId, "workflow:run:complete", {
          status: "PAUSED",
          durationMs: Date.now() - runStartTime,
        })
      } else {
        await prisma.workflowRun.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : String(error),
            steps: stepsJson,
            completedAt: new Date(),
          },
        })

        emitWorkflowEvent(runId, "workflow:run:complete", {
          status: "FAILED",
          durationMs: Date.now() - runStartTime,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  /**
   * Resume a paused workflow run.
   */
  async resume(
    runId: string,
    stepId: string,
    data: unknown
  ): Promise<void> {
    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })
    if (!run || run.status !== "PAUSED") {
      throw new Error("Run not found or not paused")
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: run.workflowId },
    })
    if (!workflow) throw new Error("Workflow not found")

    const nodes = (workflow.nodes as unknown as Node<WorkflowNodeData>[]) || []
    const edges = (workflow.edges as unknown as Edge[]) || []
    const compiled = compileWorkflow(nodes, edges)

    // Rebuild context from existing step outputs
    const existingSteps = (run.steps as unknown as StepLogEntry[]) || []
    const inputVars = (run.input as Record<string, unknown>) || {}
    const flow = rebuildFlowState(run.workflowId, run.id, inputVars, existingSteps)
    const context: ExecutionContext = {
      workflowId: run.workflowId,
      runId: run.id,
      variables: inputVars,
      stepOutputs: new Map(),
      flow,
    }

    for (const step of existingSteps) {
      if (step.output) {
        context.stepOutputs.set(step.nodeId, step.output)
      }
    }

    // Find the suspended step's node and continue from its successors
    const resumeInfo = run.resumeData as { nodeId: string } | null
    if (!resumeInfo?.nodeId) throw new Error("No resume data found")

    const suspendedStep = compiled.stepMap.get(resumeInfo.nodeId)
    if (!suspendedStep) throw new Error("Suspended step not found in workflow")

    // Store the human input as the output of the suspended step
    context.stepOutputs.set(resumeInfo.nodeId, data)
    context.flow.nodeOutputs[resumeInfo.nodeId] = data

    const stepLogs = [...existingSteps]
    // Update the suspended step log
    const suspendedLogIdx = stepLogs.findIndex((s) => s.nodeId === resumeInfo.nodeId && s.status === "suspended")
    if (suspendedLogIdx >= 0) {
      stepLogs[suspendedLogIdx] = {
        ...stepLogs[suspendedLogIdx],
        status: "success",
        output: data,
        completedAt: new Date().toISOString(),
      }
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", suspendedAt: null, resumeData: Prisma.DbNull },
    })

    const resumeStartTime = Date.now()

    try {
      // Continue from successors of the suspended node
      for (const successorId of suspendedStep.successors) {
        await this.executeStep(successorId, compiled, context, stepLogs, data)
      }

      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          output: JSON.parse(JSON.stringify(Object.fromEntries(context.stepOutputs))) as Prisma.InputJsonValue,
          steps: JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })

      emitWorkflowEvent(run.id, "workflow:run:complete", {
        status: "COMPLETED",
        durationMs: Date.now() - resumeStartTime,
      })
    } catch (error) {
      const isSuspend = error instanceof SuspendError
      const stepsJson = JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue

      if (isSuspend) {
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: "PAUSED",
            steps: stepsJson,
            suspendedAt: new Date().toISOString(),
            resumeData: {
              stepId: (error as SuspendError).stepId,
              nodeId: (error as SuspendError).nodeId,
            },
          },
        })

        emitWorkflowEvent(run.id, "workflow:run:complete", {
          status: "PAUSED",
          durationMs: Date.now() - resumeStartTime,
        })
      } else {
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : String(error),
            steps: stepsJson,
            completedAt: new Date(),
          },
        })

        emitWorkflowEvent(run.id, "workflow:run:complete", {
          status: "FAILED",
          durationMs: Date.now() - resumeStartTime,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private async executeStep(
    nodeId: string,
    compiled: ReturnType<typeof compileWorkflow>,
    context: ExecutionContext,
    stepLogs: StepLogEntry[],
    input: unknown
  ): Promise<void> {
    const step = compiled.stepMap.get(nodeId)
    if (!step) return

    // ── MERGE gate: wait until ALL predecessors have produced output ──
    // In a PARALLEL→MERGE pattern, each branch independently follows
    // successors to the MERGE node. Only the LAST branch to arrive
    // should actually execute the merge and continue the chain.
    if (step.nodeType === NodeType.MERGE) {
      const allPredecessorsReady = step.predecessors.every(
        (predId) => context.stepOutputs.has(predId)
      )
      if (!allPredecessorsReady) {
        return // Other branches haven't finished yet — skip for now
      }
    }

    const handler = NODE_HANDLERS[step.nodeType]
    if (!handler) {
      stepLogs.push(createStepLog(step, "failed", input, null, `No handler for ${step.nodeType}`))
      throw new Error(`No handler for node type: ${step.nodeType}`)
    }

    const startTime = Date.now()
    stepLogs.push(createStepLog(step, "running", input))

    // Emit step:start event
    emitWorkflowEvent(context.runId, "workflow:step:start", {
      nodeId,
      nodeType: step.nodeType,
      label: step.data.label,
    })

    // Small delay to ensure UI updates before step completes
    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      const result = await handler(step.data, input, context)

      if (result.suspend) {
        // Update the running step log to suspended
        const idx = stepLogs.findIndex((s) => s.nodeId === nodeId && s.status === "running")
        if (idx >= 0) {
          stepLogs[idx] = {
            ...stepLogs[idx],
            status: "suspended",
            durationMs: Date.now() - startTime,
          }
        }

        emitWorkflowEvent(context.runId, "workflow:step:suspend", {
          nodeId,
          nodeType: step.nodeType,
        })

        throw new SuspendError(nodeId, stepLogs[stepLogs.length - 1]?.stepId || nodeId)
      }

      const durationMs = Date.now() - startTime

      // Extract token usage from AI node outputs (LLM, Agent, Stream)
      const tokenUsage = extractTokenUsage(result.output)

      // Update the running step log to success
      const idx = stepLogs.findIndex((s) => s.nodeId === nodeId && s.status === "running")
      if (idx >= 0) {
        stepLogs[idx] = {
          ...stepLogs[idx],
          status: "success",
          output: result.output,
          durationMs,
          completedAt: new Date().toISOString(),
          ...(tokenUsage && { tokenUsage }),
        }
      }

      // Emit step:success event with truncated output preview
      const outputPreview = (() => {
        try {
          const str = JSON.stringify(result.output)
          return str.length > 200 ? str.slice(0, 200) + "..." : str
        } catch { return undefined }
      })()

      emitWorkflowEvent(context.runId, "workflow:step:success", {
        nodeId,
        nodeType: step.nodeType,
        durationMs,
        outputPreview,
      })

      context.stepOutputs.set(nodeId, result.output)
      context.flow.nodeOutputs[nodeId] = result.output

      // ── LOOP iteration (foreach) ──
      if (step.nodeType === NodeType.LOOP && result.branch === "loop") {
        const loopOutput = result.output as { items: unknown[] }
        const loopBodyNodeIds = step.sourceHandles["loop"] || []
        const doneNodeIds = step.sourceHandles["done"] || []

        if (loopBodyNodeIds.length > 0 && loopOutput?.items) {
          const allOutputs: unknown[] = []

          // Get maxIterations from node data (default: 100)
          const loopNodeData = step.data as LoopNodeData
          const maxIterations = loopNodeData.maxIterations ?? 100
          const actualIterations = Math.min(loopOutput.items.length, maxIterations)

          // Warn if truncating
          if (loopOutput.items.length > maxIterations) {
            console.warn(
              `[workflow] Loop node ${nodeId} truncated from ${loopOutput.items.length} to ${maxIterations} iterations (maxIterations limit)`
            )
          }

          const lastBodyId = loopBodyNodeIds[loopBodyNodeIds.length - 1]
          const concurrency = loopNodeData.concurrency ?? 1

          if (concurrency <= 1) {
            // Sequential execution
            for (let i = 0; i < actualIterations; i++) {
              const item = loopOutput.items[i]
              context.flow.state["$item"] = item
              context.flow.state["$index"] = i
              context.flow.state["$total"] = actualIterations

              for (const bodyNodeId of loopBodyNodeIds) {
                await this.executeStep(bodyNodeId, compiled, context, stepLogs, item)
              }
              allOutputs.push(context.stepOutputs.get(lastBodyId))
            }
          } else {
            // Concurrent execution in batches
            const batchOutputs: unknown[] = new Array(actualIterations)
            for (let batchStart = 0; batchStart < actualIterations; batchStart += concurrency) {
              const batchEnd = Math.min(batchStart + concurrency, actualIterations)
              const batch: Promise<void>[] = []

              for (let i = batchStart; i < batchEnd; i++) {
                const item = loopOutput.items[i]
                batch.push(
                  (async () => {
                    for (const bodyNodeId of loopBodyNodeIds) {
                      await this.executeStep(bodyNodeId, compiled, context, stepLogs, item)
                    }
                    batchOutputs[i] = context.stepOutputs.get(lastBodyId)
                  })()
                )
              }
              await Promise.all(batch)
            }
            allOutputs.push(...batchOutputs)
          }

          // Clean up loop state
          delete context.flow.state["$item"]
          delete context.flow.state["$index"]
          delete context.flow.state["$total"]

          // Store collected outputs and continue to "done" branch
          context.stepOutputs.set(nodeId, allOutputs)
          context.flow.nodeOutputs[nodeId] = allOutputs

          for (const doneId of doneNodeIds) {
            await this.executeStep(doneId, compiled, context, stepLogs, allOutputs)
          }
          return // skip default successor traversal
        }
      }

      // ── PARALLEL execution ──
      if (step.nodeType === NodeType.PARALLEL) {
        const branchNodeIds = step.successors
        await Promise.all(
          branchNodeIds.map((id) =>
            this.executeStep(id, compiled, context, stepLogs, result.output)
          )
        )
        return // successors already executed in parallel
      }

      // ── MERGE: collect predecessor outputs ──
      if (step.nodeType === NodeType.MERGE) {
        // Re-run handler with collected predecessor outputs
        const predecessorOutputs = step.predecessors
          .map((predId) => context.stepOutputs.get(predId))
          .filter((o) => o !== undefined)

        const mergeResult = await handler(step.data, predecessorOutputs, context)
        context.stepOutputs.set(nodeId, mergeResult.output)
        context.flow.nodeOutputs[nodeId] = mergeResult.output

        // Update step log with actual merge result
        const mergeIdx = stepLogs.findIndex((s) => s.nodeId === nodeId && s.status === "success")
        if (mergeIdx >= 0) {
          stepLogs[mergeIdx] = { ...stepLogs[mergeIdx], output: mergeResult.output }
        }

        for (const nextId of step.successors) {
          await this.executeStep(nextId, compiled, context, stepLogs, mergeResult.output)
        }
        return
      }

      // ── ERROR_HANDLER: try-catch branching ──
      if (step.nodeType === NodeType.ERROR_HANDLER) {
        const successNodeIds = step.sourceHandles["success"] || []
        const errorNodeIds = step.sourceHandles["error"] || []
        const ehData = step.data as ErrorHandlerNodeData
        const retryCount = ehData.retryCount ?? 0
        const retryDelay = ehData.retryDelay ?? 1000

        let lastError: Error | null = null
        let succeeded = false

        for (let attempt = 0; attempt <= retryCount; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
              emitWorkflowEvent(context.runId, "workflow:step:retry", {
                nodeId,
                attempt,
                maxRetries: retryCount,
              })
            }

            for (const successId of successNodeIds) {
              await this.executeStep(successId, compiled, context, stepLogs, input)
            }
            succeeded = true
            break
          } catch (err) {
            if (err instanceof SuspendError) throw err
            lastError = err instanceof Error ? err : new Error(String(err))
          }
        }

        if (!succeeded && errorNodeIds.length > 0) {
          const errorOutput = {
            error: lastError?.message || "Unknown error",
            originalInput: input,
            retryAttempts: retryCount,
            fallbackValue: ehData.fallbackValue ? (() => {
              try { return JSON.parse(ehData.fallbackValue!) } catch { return ehData.fallbackValue }
            })() : undefined,
          }
          context.stepOutputs.set(nodeId, errorOutput)
          context.flow.nodeOutputs[nodeId] = errorOutput

          for (const errorId of errorNodeIds) {
            await this.executeStep(errorId, compiled, context, stepLogs, errorOutput)
          }
        } else if (!succeeded) {
          throw lastError || new Error("Error handler: all retries failed")
        }

        return
      }

      // ── Default successor traversal ──
      let nextNodeIds: string[]

      if (result.branch && step.sourceHandles[result.branch]) {
        nextNodeIds = step.sourceHandles[result.branch]
      } else {
        nextNodeIds = step.successors
      }

      for (const nextId of nextNodeIds) {
        await this.executeStep(nextId, compiled, context, stepLogs, result.output)
      }
    } catch (error) {
      if (error instanceof SuspendError) throw error

      const errorDurationMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      const idx = stepLogs.findIndex((s) => s.nodeId === nodeId && s.status === "running")
      if (idx >= 0) {
        stepLogs[idx] = {
          ...stepLogs[idx],
          status: "failed",
          error: errorMessage,
          durationMs: errorDurationMs,
          completedAt: new Date().toISOString(),
        }
      }

      emitWorkflowEvent(context.runId, "workflow:step:error", {
        nodeId,
        nodeType: step.nodeType,
        error: errorMessage,
        durationMs: errorDurationMs,
      })

      throw error
    }
  }
}

class SuspendError extends Error {
  constructor(
    public nodeId: string,
    public stepId: string
  ) {
    super("Workflow suspended for human input")
    this.name = "SuspendError"
  }
}

/**
 * Build a TemplateContext for use in node handlers.
 * Convenience helper so node handlers don't need to import TemplateContext directly.
 */
export function buildTemplateContext(
  nodeId: string,
  nodeType: string,
  input: unknown,
  context: ExecutionContext
): TemplateContext {
  return {
    input,
    flow: context.flow,
    node: { id: nodeId, type: nodeType },
  }
}

// Singleton
export const workflowEngine = new WorkflowEngine()
