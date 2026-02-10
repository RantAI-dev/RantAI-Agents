import type { Node, Edge } from "@xyflow/react"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { WorkflowNodeData, StepLogEntry } from "./types"
import { NodeType } from "./types"
import { compileWorkflow, createStepLog, type CompiledStep } from "./compiler"
import { validateWorkflow } from "./utils"

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

export interface ExecutionContext {
  workflowId: string
  runId: string
  variables: Record<string, unknown>
  stepOutputs: Map<string, unknown>
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
  [NodeType.PROMPT]: executeLlm,
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
  [NodeType.RAG_SEARCH]: executeIntegration,
  [NodeType.DATABASE]: executeIntegration,
  [NodeType.STORAGE]: executeIntegration,
}

export class WorkflowEngine {
  /**
   * Execute a workflow from scratch.
   */
  async execute(
    workflowId: string,
    input: Record<string, unknown> = {}
  ): Promise<string> {
    // Load workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    })
    if (!workflow) throw new Error("Workflow not found")

    const nodes = (workflow.nodes as unknown as Node<WorkflowNodeData>[]) || []
    const edges = (workflow.edges as unknown as Edge[]) || []

    // Validate
    const validation = validateWorkflow(nodes, edges)
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(", ")}`)
    }

    // Create run
    const run = await prisma.workflowRun.create({
      data: {
        workflowId,
        status: "RUNNING",
        input: input as Prisma.InputJsonValue,
        steps: [],
      },
    })

    // Compile
    const compiled = compileWorkflow(nodes, edges)

    // Context
    const context: ExecutionContext = {
      workflowId,
      runId: run.id,
      variables: { ...input },
      stepOutputs: new Map(),
    }

    const stepLogs: StepLogEntry[] = []

    try {
      // Execute starting from trigger
      await this.executeStep(compiled.triggerNodeId, compiled, context, stepLogs, input)

      // Mark completed
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          output: JSON.parse(JSON.stringify(Object.fromEntries(context.stepOutputs))) as Prisma.InputJsonValue,
          steps: JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
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
      }
    }

    return run.id
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
    const context: ExecutionContext = {
      workflowId: run.workflowId,
      runId: run.id,
      variables: (run.input as Record<string, unknown>) || {},
      stepOutputs: new Map(),
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

    const handler = NODE_HANDLERS[step.nodeType]
    if (!handler) {
      stepLogs.push(createStepLog(step, "failed", input, null, `No handler for ${step.nodeType}`))
      throw new Error(`No handler for node type: ${step.nodeType}`)
    }

    const startTime = Date.now()
    stepLogs.push(createStepLog(step, "running", input))

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
        throw new SuspendError(nodeId, stepLogs[stepLogs.length - 1]?.stepId || nodeId)
      }

      // Update the running step log to success
      const idx = stepLogs.findIndex((s) => s.nodeId === nodeId && s.status === "running")
      if (idx >= 0) {
        stepLogs[idx] = {
          ...stepLogs[idx],
          status: "success",
          output: result.output,
          durationMs: Date.now() - startTime,
          completedAt: new Date().toISOString(),
        }
      }

      context.stepOutputs.set(nodeId, result.output)

      // Determine next steps
      let nextNodeIds: string[]

      if (result.branch && step.sourceHandles[result.branch]) {
        // Branching: follow the specific handle
        nextNodeIds = step.sourceHandles[result.branch]
      } else {
        // Default: follow all successors
        nextNodeIds = step.successors
      }

      // Execute successors sequentially
      for (const nextId of nextNodeIds) {
        await this.executeStep(nextId, compiled, context, stepLogs, result.output)
      }
    } catch (error) {
      if (error instanceof SuspendError) throw error

      const idx = stepLogs.findIndex((s) => s.nodeId === nodeId && s.status === "running")
      if (idx >= 0) {
        stepLogs[idx] = {
          ...stepLogs[idx],
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
          completedAt: new Date().toISOString(),
        }
      }

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

// Singleton
export const workflowEngine = new WorkflowEngine()
