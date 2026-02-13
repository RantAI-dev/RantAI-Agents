import type { Node, Edge } from "@xyflow/react"
import type {
  WorkflowNodeData,
  TriggerConfig,
  WorkflowVariables,
} from "./types"

// ─── Export Format ──────────────────────────────────────

export interface WorkflowExportFormat {
  version: 1
  name: string
  description: string | null
  mode: "STANDARD" | "CHATFLOW"
  trigger: TriggerConfig
  variables: WorkflowVariables
  nodes: SerializedNode[]
  edges: SerializedEdge[]
  metadata: {
    exportedAt: string
    nodeCount: number
    edgeCount: number
  }
}

interface SerializedNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: WorkflowNodeData
}

interface SerializedEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

// ─── Export ─────────────────────────────────────────────

export function exportWorkflow(workflow: {
  name: string
  description: string | null
  mode?: string
  trigger?: unknown
  variables?: unknown
  nodes: unknown[]
  edges: unknown[]
}): WorkflowExportFormat {
  const nodes = (workflow.nodes || []) as Node<WorkflowNodeData>[]
  const edges = (workflow.edges || []) as Edge[]

  return {
    version: 1,
    name: workflow.name,
    description: workflow.description,
    mode: (workflow.mode as "STANDARD" | "CHATFLOW") || "STANDARD",
    trigger: (workflow.trigger as TriggerConfig) || { type: "manual" },
    variables: (workflow.variables as WorkflowVariables) || { inputs: [], outputs: [] },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type || n.data?.nodeType || "unknown",
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    })),
    metadata: {
      exportedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  }
}

// ─── Import ─────────────────────────────────────────────

export interface ImportResult {
  name: string
  description: string | null
  mode: "STANDARD" | "CHATFLOW"
  trigger: TriggerConfig
  variables: WorkflowVariables
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
}

export function importWorkflow(data: unknown): ImportResult {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid workflow data: expected an object")
  }

  const wf = data as Record<string, unknown>

  // Validate version
  if (wf.version !== 1) {
    throw new Error(`Unsupported workflow version: ${wf.version}`)
  }

  // Validate required fields
  if (!wf.name || typeof wf.name !== "string") {
    throw new Error("Invalid workflow: missing name")
  }
  if (!Array.isArray(wf.nodes)) {
    throw new Error("Invalid workflow: missing or invalid nodes array")
  }
  if (!Array.isArray(wf.edges)) {
    throw new Error("Invalid workflow: missing or invalid edges array")
  }

  // Re-generate node IDs to avoid collisions with existing workflows
  const idMap = new Map<string, string>()
  const now = Date.now()

  const nodes: Node<WorkflowNodeData>[] = (wf.nodes as SerializedNode[]).map(
    (n, i) => {
      const newId = `imported_${now}_${i}`
      idMap.set(n.id, newId)
      return {
        id: newId,
        type: n.type || (n.data as WorkflowNodeData)?.nodeType || "unknown",
        position: n.position || { x: 0, y: i * 150 },
        data: n.data as WorkflowNodeData,
      }
    }
  )

  const edges: Edge[] = (wf.edges as SerializedEdge[]).map((e, i) => ({
    id: `imported_edge_${now}_${i}`,
    source: idMap.get(e.source) || e.source,
    target: idMap.get(e.target) || e.target,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
    animated: true,
    style: { stroke: "#64748b", strokeWidth: 2 },
  }))

  return {
    name: wf.name as string,
    description: (wf.description as string | null) || null,
    mode: (wf.mode as "STANDARD" | "CHATFLOW") || "STANDARD",
    trigger: (wf.trigger as TriggerConfig) || { type: "manual" },
    variables: (wf.variables as WorkflowVariables) || { inputs: [], outputs: [] },
    nodes,
    edges,
  }
}

// ─── Validation ─────────────────────────────────────────

export function validateImportData(data: unknown): { valid: boolean; error?: string } {
  try {
    importWorkflow(data)
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Invalid data" }
  }
}
