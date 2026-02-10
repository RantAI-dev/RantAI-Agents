import type { Node, Edge } from "@xyflow/react"
import type { WorkflowNodeData, StepLogEntry } from "./types"
import { topologicalSort, getNodeSuccessors } from "./utils"
import { NodeType } from "./types"

export interface CompiledStep {
  nodeId: string
  nodeType: NodeType
  data: WorkflowNodeData
  successors: string[]
  sourceHandles: Record<string, string[]> // handleId -> target nodeIds
}

export interface CompiledWorkflow {
  steps: CompiledStep[]
  stepMap: Map<string, CompiledStep>
  triggerNodeId: string
}

/**
 * Compile a React Flow graph into an execution-ready workflow.
 * Walks the graph in topological order and builds a step map.
 */
export function compileWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[]
): CompiledWorkflow {
  const sorted = topologicalSort(nodes, edges)
  const steps: CompiledStep[] = []
  const stepMap = new Map<string, CompiledStep>()

  let triggerNodeId = ""

  for (const node of sorted) {
    const data = node.data as WorkflowNodeData
    const successors = getNodeSuccessors(node.id, edges)

    // Build source handle mapping for branching nodes
    const sourceHandles: Record<string, string[]> = {}
    for (const edge of edges) {
      if (edge.source === node.id) {
        const handleId = edge.sourceHandle || "default"
        if (!sourceHandles[handleId]) sourceHandles[handleId] = []
        sourceHandles[handleId].push(edge.target)
      }
    }

    const step: CompiledStep = {
      nodeId: node.id,
      nodeType: data.nodeType,
      data,
      successors,
      sourceHandles,
    }

    steps.push(step)
    stepMap.set(node.id, step)

    // Track trigger
    if (
      data.nodeType === NodeType.TRIGGER_MANUAL ||
      data.nodeType === NodeType.TRIGGER_WEBHOOK ||
      data.nodeType === NodeType.TRIGGER_SCHEDULE ||
      data.nodeType === NodeType.TRIGGER_EVENT
    ) {
      if (!triggerNodeId) triggerNodeId = node.id
    }
  }

  return { steps, stepMap, triggerNodeId }
}

/**
 * Create a step log entry for tracking execution.
 */
export function createStepLog(
  step: CompiledStep,
  status: StepLogEntry["status"],
  input: unknown,
  output: unknown = null,
  error?: string,
  durationMs: number = 0
): StepLogEntry {
  return {
    stepId: `step_${step.nodeId}_${Date.now()}`,
    nodeId: step.nodeId,
    nodeType: step.nodeType,
    label: step.data.label,
    status,
    input,
    output,
    error,
    durationMs,
    startedAt: new Date().toISOString(),
    completedAt: status !== "running" && status !== "pending" ? new Date().toISOString() : undefined,
  }
}
