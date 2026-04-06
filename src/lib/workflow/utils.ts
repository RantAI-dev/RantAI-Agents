import type { Node, Edge } from "@xyflow/react"
import type { WorkflowNodeData } from "./types"
import { NodeType } from "./types"

/**
 * Topological sort using Kahn's algorithm.
 * Returns nodes in execution order.
 */
export function topologicalSort(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[]
): Node<WorkflowNodeData>[] {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    adjacency.get(edge.source)?.push(edge.target)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(current)
    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return sorted.map((id) => nodeMap.get(id)!).filter(Boolean)
}

/**
 * Detect cycles in the graph (excluding loop-back edges).
 * Returns true if a cycle is found.
 */
export function detectCycles(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[]
): boolean {
  const sorted = topologicalSort(nodes, edges)
  return sorted.length !== nodes.length
}

/**
 * Validate a workflow before execution.
 */
export function validateWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (nodes.length === 0) {
    errors.push("Workflow has no nodes")
    return { valid: false, errors }
  }

  // Check for at least one trigger
  const triggers = nodes.filter((n) => {
    const data = n.data as WorkflowNodeData
    return (
      data.nodeType === NodeType.TRIGGER_MANUAL ||
      data.nodeType === NodeType.TRIGGER_WEBHOOK ||
      data.nodeType === NodeType.TRIGGER_SCHEDULE ||
      data.nodeType === NodeType.TRIGGER_EVENT
    )
  })

  if (triggers.length === 0) {
    errors.push("Workflow must have at least one trigger node")
  }

  // Check for orphan nodes (no edges connected)
  const connectedNodes = new Set<string>()
  for (const edge of edges) {
    connectedNodes.add(edge.source)
    connectedNodes.add(edge.target)
  }

  // Triggers don't need incoming edges, but all others should
  for (const node of nodes) {
    if (triggers.some((t) => t.id === node.id)) continue
    if (!connectedNodes.has(node.id) && nodes.length > 1) {
      errors.push(`Node "${(node.data as WorkflowNodeData).label}" is not connected`)
    }
  }

  // Check for cycles
  if (detectCycles(nodes, edges)) {
    errors.push("Workflow contains a cycle (excluding loop nodes)")
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Get successor node IDs from a given node.
 */
export function getNodeSuccessors(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target)
}

/**
 * Get predecessor node IDs for a given node.
 */
export function getNodePredecessors(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source)
}
