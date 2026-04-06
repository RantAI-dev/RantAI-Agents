import type { Node, Edge } from "@xyflow/react"
import type { WorkflowNodeData } from "./types"
import { NodeType } from "./types"

export interface ValidationError {
  nodeId?: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

const TRIGGER_TYPES = new Set([
  NodeType.TRIGGER_MANUAL,
  NodeType.TRIGGER_WEBHOOK,
  NodeType.TRIGGER_SCHEDULE,
  NodeType.TRIGGER_EVENT,
])

/**
 * Validate a workflow before execution.
 * Checks for common issues: missing trigger, disconnected nodes,
 * missing required fields, and unreachable nodes.
 */
export function validateWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  mode: "STANDARD" | "CHATFLOW" = "STANDARD"
): ValidationResult {
  const errors: ValidationError[] = []

  if (nodes.length === 0) {
    errors.push({ message: "Workflow has no nodes" })
    return { valid: false, errors }
  }

  // 1. Check for trigger node
  const triggerNodes = nodes.filter((n) => TRIGGER_TYPES.has(n.data.nodeType))
  if (triggerNodes.length === 0) {
    errors.push({ message: "Workflow needs at least one Trigger node" })
  } else if (triggerNodes.length > 1) {
    errors.push({ message: "Workflow should have only one Trigger node" })
  }

  // 2. Check CHATFLOW has STREAM_OUTPUT
  if (mode === "CHATFLOW") {
    const hasStreamOutput = nodes.some((n) => n.data.nodeType === NodeType.STREAM_OUTPUT)
    if (!hasStreamOutput) {
      errors.push({ message: "Chatflow mode requires a Stream Output node" })
    }
  }

  // 3. Check for disconnected nodes (no input AND no output connections, excluding triggers)
  const connectedNodeIds = new Set<string>()
  for (const edge of edges) {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }
  for (const node of nodes) {
    if (TRIGGER_TYPES.has(node.data.nodeType)) continue // triggers don't need input
    if (nodes.length === 1) continue // single node is fine
    if (!connectedNodeIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `"${node.data.label}" is not connected to any other node`,
      })
    }
  }

  // 4. Check nodes without input connections (excluding triggers)
  const nodesWithInput = new Set(edges.map((e) => e.target))
  for (const node of nodes) {
    if (TRIGGER_TYPES.has(node.data.nodeType)) continue
    if (!nodesWithInput.has(node.id) && connectedNodeIds.has(node.id)) {
      // Node has output connections but no input — might be unreachable
      errors.push({
        nodeId: node.id,
        message: `"${node.data.label}" has no input connection`,
      })
    }
  }

  // 5. Check required fields per node type
  for (const node of nodes) {
    const d = node.data
    switch (d.nodeType) {
      case NodeType.AGENT:
        if (!(d as { assistantId?: string }).assistantId) {
          errors.push({ nodeId: node.id, message: `"${d.label}" requires an agent to be selected` })
        }
        break
      case NodeType.LLM:
      case NodeType.STREAM_OUTPUT:
        if (!(d as { model?: string }).model) {
          errors.push({ nodeId: node.id, message: `"${d.label}" requires a model to be selected` })
        }
        break
      case NodeType.CONDITION:
        if (!(d as { conditionExpression?: string }).conditionExpression) {
          errors.push({ nodeId: node.id, message: `"${d.label}" requires a condition expression` })
        }
        break
      case NodeType.HTTP:
        if (!(d as { url?: string }).url) {
          errors.push({ nodeId: node.id, message: `"${d.label}" requires a URL` })
        }
        break
      case NodeType.SUB_WORKFLOW:
        if (!(d as { workflowId?: string }).workflowId) {
          errors.push({ nodeId: node.id, message: `"${d.label}" requires a workflow to be selected` })
        }
        break
    }
  }

  return { valid: errors.length === 0, errors }
}
